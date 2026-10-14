-- R5 additive policy/checkpoints. No bank values, keys or credentials are copied.
-- Stage activation/backfill are separate explicit operator actions, never startup.
CREATE TABLE public.data_encryption_control (
  id integer PRIMARY KEY CHECK (id = 1),
  stage text NOT NULL DEFAULT 'legacy' CHECK (stage IN ('legacy','encrypted-write','contract')),
  writer_fingerprint text,
  review_reference text,
  credential_policy text NOT NULL DEFAULT 'unselected' CHECK (credential_policy IN ('unselected','delete','encrypt')),
  credential_review_reference text,
  credential_delete_after date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encryption_control_writer_check CHECK (
    (stage = 'legacy' AND writer_fingerprint IS NULL) OR
    (stage <> 'legacy' AND writer_fingerprint IS NOT NULL AND writer_fingerprint ~ '^[0-9a-f]{64}$')),
  CONSTRAINT encryption_contract_review_check CHECK (stage <> 'contract' OR (review_reference IS NOT NULL AND review_reference ~ '^[0-9a-f]{64}$')),
  CONSTRAINT encryption_credential_review_check CHECK (
    (credential_policy='unselected' AND credential_review_reference IS NULL AND credential_delete_after IS NULL) OR
    (credential_policy<>'unselected' AND credential_review_reference IS NOT NULL AND credential_review_reference ~ '^[0-9a-f]{64}$' AND
      (credential_policy='delete' OR credential_delete_after IS NOT NULL)))
);
INSERT INTO public.data_encryption_control(id) VALUES (1);

CREATE TABLE public.data_encryption_runs (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('backfill','rotate')),
  database_name text NOT NULL,
  writer_fingerprint text NOT NULL CHECK (writer_fingerprint ~ '^[0-9a-f]{64}$'),
  credential_policy text NOT NULL,
  credential_review_reference text,
  credential_delete_after date,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','verified')),
  last_merchant_id integer NOT NULL DEFAULT 0 CHECK (last_merchant_id >= 0),
  sweep_number integer NOT NULL DEFAULT 0 CHECK (sweep_number >= 0),
  batch_number integer NOT NULL DEFAULT 0 CHECK (batch_number >= 0),
  rows_scanned bigint NOT NULL DEFAULT 0 CHECK (rows_scanned >= 0),
  rows_changed bigint NOT NULL DEFAULT 0 CHECK (rows_changed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.data_encryption_batches (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.data_encryption_runs(id),
  batch_number integer NOT NULL CHECK (batch_number > 0),
  rows_scanned integer NOT NULL CHECK (rows_scanned >= 0),
  rows_changed integer NOT NULL CHECK (rows_changed >= 0 AND rows_changed <= rows_scanned),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encryption_batch_number_uq UNIQUE(run_id,batch_number)
);

CREATE FUNCTION public.encryption_control_monotonic() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ENCRYPTION_POLICY_IMMUTABLE'; END IF;
  IF NEW.id <> OLD.id OR (OLD.credential_policy='delete' AND NEW.credential_policy<>'delete') OR
     (OLD.credential_policy<>'unselected' AND NEW.credential_policy='unselected') OR array_position(ARRAY['legacy','encrypted-write','contract'],NEW.stage)
       < array_position(ARRAY['legacy','encrypted-write','contract'],OLD.stage) THEN
    RAISE EXCEPTION 'ENCRYPTION_POLICY_DOWNGRADE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER encryption_control_monotonic BEFORE UPDATE OR DELETE ON public.data_encryption_control
  FOR EACH ROW EXECUTE FUNCTION public.encryption_control_monotonic();

CREATE FUNCTION public.guard_encrypted_bank_writes() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE policy public.data_encryption_control%ROWTYPE;
  columns text[] := ARRAY['bank_name','bank_branch','account_holder_name','bank_account_number','windcave_api_key'];
  column_name text; value text; previous text; old_json jsonb; new_json jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP='UPDATE' THEN
    old_json := to_jsonb(OLD);
    IF NEW.id IS DISTINCT FROM OLD.id AND EXISTS (
      SELECT 1 FROM unnest(columns) AS c WHERE old_json->>c LIKE 'enc:%') THEN
      RAISE EXCEPTION 'ENCRYPTION_ROW_ID_IMMUTABLE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM unnest(columns) AS c
      WHERE new_json->>c IS DISTINCT FROM old_json->>c) THEN RETURN NEW; END IF;
  END IF;
  -- Unrelated profile/payment edits and null-only signup never wait on an
  -- operator's policy activation scan. Only sensitive writes need that fence.
  IF NOT EXISTS (SELECT 1 FROM unnest(columns) AS c WHERE new_json->>c IS NOT NULL) THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM public.data_encryption_control WHERE id=1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENCRYPTION_POLICY_MISSING'; END IF;
  IF policy.stage='legacy' THEN RETURN NEW; END IF;
  FOREACH column_name IN ARRAY columns LOOP
    value := new_json->>column_name;
    previous := old_json->>column_name;
    IF column_name='windcave_api_key' AND policy.credential_policy='unselected' THEN
      IF policy.stage='contract' AND value IS NOT NULL AND (TG_OP='INSERT' OR value IS DISTINCT FROM previous) THEN
        RAISE EXCEPTION 'ENCRYPTION_NEW_CREDENTIAL_REFUSED';
      END IF;
      CONTINUE;
    END IF;
    IF value IS NOT NULL AND (TG_OP='INSERT' OR value IS DISTINCT FROM previous) THEN
      IF column_name='windcave_api_key' AND (policy.credential_policy='delete' OR TG_OP='INSERT' OR previous IS NULL) THEN
        RAISE EXCEPTION 'ENCRYPTION_NEW_CREDENTIAL_REFUSED';
      END IF;
      IF column_name='windcave_api_key' AND policy.credential_policy='encrypt' AND
        policy.credential_delete_after <= timezone('UTC',now())::date THEN
        RAISE EXCEPTION 'ENCRYPTION_CREDENTIAL_REVIEW_EXPIRED';
      END IF;
      IF octet_length(value)>1398262 OR value !~ '^enc:v1:[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$' THEN
        RAISE EXCEPTION 'ENCRYPTION_PLAINTEXT_WRITE_REFUSED';
      END IF;
      IF encode(sha256(convert_to('taptpay:bank-writer:v1:' || split_part(value,':',3),'UTF8')),'hex')
          <> policy.writer_fingerprint THEN RAISE EXCEPTION 'ENCRYPTION_WRITER_CHANGED'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_encrypted_bank_writes BEFORE INSERT OR UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.guard_encrypted_bank_writes();

CREATE FUNCTION public.encryption_batch_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'ENCRYPTION_BATCH_IMMUTABLE'; END $$;
CREATE TRIGGER encryption_batch_immutable BEFORE UPDATE OR DELETE ON public.data_encryption_batches
  FOR EACH ROW EXECUTE FUNCTION public.encryption_batch_immutable();

CREATE FUNCTION public.encryption_run_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ENCRYPTION_RUN_IMMUTABLE'; END IF;
  IF NEW.id<>OLD.id OR NEW.mode<>OLD.mode OR NEW.database_name<>OLD.database_name OR
     NEW.writer_fingerprint<>OLD.writer_fingerprint OR NEW.created_at<>OLD.created_at OR
     NEW.credential_policy<>OLD.credential_policy OR NEW.credential_review_reference IS DISTINCT FROM OLD.credential_review_reference OR
     NEW.credential_delete_after IS DISTINCT FROM OLD.credential_delete_after OR
     OLD.state='verified' OR NEW.rows_scanned<OLD.rows_scanned OR NEW.rows_changed<OLD.rows_changed OR
     NEW.batch_number<OLD.batch_number OR NEW.sweep_number<OLD.sweep_number THEN
    RAISE EXCEPTION 'ENCRYPTION_RUN_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER encryption_run_identity BEFORE UPDATE OR DELETE ON public.data_encryption_runs
  FOR EACH ROW EXECUTE FUNCTION public.encryption_run_identity();
