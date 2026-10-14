-- R5 forward active-credential expansion; existing 0048a bytes stay immutable.
ALTER TABLE public.data_encryption_control ADD COLUMN active_secret_stage text NOT NULL DEFAULT 'legacy'
  CHECK (active_secret_stage IN ('legacy','encrypted-write','contract'));
ALTER TABLE public.data_encryption_control ADD COLUMN active_secret_review_reference text;
ALTER TABLE public.data_encryption_control ADD CONSTRAINT active_secret_contract_review_check CHECK (
  active_secret_stage<>'contract' OR (active_secret_review_reference IS NOT NULL AND active_secret_review_reference ~ '^[0-9a-f]{64}$'));
ALTER TABLE public.data_encryption_runs ADD COLUMN scope text NOT NULL DEFAULT 'bank' CHECK (scope IN ('bank','active'));
ALTER TABLE public.data_encryption_runs ADD COLUMN table_cursor integer NOT NULL DEFAULT 0 CHECK (table_cursor BETWEEN 0 AND 4);
ALTER TABLE public.data_encryption_runs ADD COLUMN last_record_id text;

CREATE FUNCTION public.encryption_active_control_monotonic() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF array_position(ARRAY['legacy','encrypted-write','contract'],NEW.active_secret_stage)
    < array_position(ARRAY['legacy','encrypted-write','contract'],OLD.active_secret_stage) THEN
    RAISE EXCEPTION 'ENCRYPTION_POLICY_DOWNGRADE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER encryption_active_control_monotonic BEFORE UPDATE ON public.data_encryption_control
  FOR EACH ROW EXECUTE FUNCTION public.encryption_active_control_monotonic();

CREATE FUNCTION public.encryption_run_scope_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.scope<>OLD.scope OR NEW.table_cursor<OLD.table_cursor AND NEW.sweep_number=OLD.sweep_number THEN
    RAISE EXCEPTION 'ENCRYPTION_RUN_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER encryption_run_scope_identity BEFORE UPDATE ON public.data_encryption_runs
  FOR EACH ROW EXECUTE FUNCTION public.encryption_run_scope_identity();

CREATE FUNCTION public.guard_active_secret_writes() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE policy public.data_encryption_control%ROWTYPE; column_name text := TG_ARGV[0];
  new_value text := to_jsonb(NEW)->>column_name; old_value text;
BEGIN
  IF TG_OP='UPDATE' THEN
    old_value := to_jsonb(OLD)->>column_name;
    IF NEW.id IS DISTINCT FROM OLD.id AND old_value LIKE 'enc:%' THEN
      RAISE EXCEPTION 'ENCRYPTION_ROW_ID_IMMUTABLE';
    END IF;
    IF new_value IS NOT DISTINCT FROM old_value THEN RETURN NEW; END IF;
  END IF;
  IF new_value IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM public.data_encryption_control WHERE id=1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENCRYPTION_POLICY_MISSING'; END IF;
  IF policy.active_secret_stage='legacy' THEN RETURN NEW; END IF;
  IF octet_length(new_value)>1398262 OR new_value !~ '^enc:v1:[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$' THEN
    RAISE EXCEPTION 'ENCRYPTION_PLAINTEXT_WRITE_REFUSED';
  END IF;
  IF encode(sha256(convert_to('taptpay:bank-writer:v1:' || split_part(new_value,':',3),'UTF8')),'hex')<>policy.writer_fingerprint THEN
    RAISE EXCEPTION 'ENCRYPTION_WRITER_CHANGED';
  END IF;
  IF column_name='token' AND to_jsonb(NEW)->>'token_hash' IS NULL THEN RAISE EXCEPTION 'ENCRYPTION_LOOKUP_HASH_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_active_secret_writes BEFORE INSERT OR UPDATE ON public.merchant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_secret_writes('windcave_card_id');
CREATE TRIGGER guard_active_secret_writes BEFORE INSERT OR UPDATE ON public.invoices_rent_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_secret_writes('token');
CREATE TRIGGER guard_active_secret_writes BEFORE INSERT OR UPDATE ON public.job_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_secret_writes('token');
CREATE TRIGGER guard_active_secret_writes BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_secret_writes('token');
