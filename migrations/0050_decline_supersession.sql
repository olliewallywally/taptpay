-- T-3 (docs/decisions/2026-10-15-t3-decline-supersession.md, revision 3, approved with conditions
-- C1-C10 in review pass 2): a later verified approval in a Windcave session supersedes the session's
-- recorded decline. Nothing else is superseded. Objects that replace earlier ones keep their names,
-- so earlier migrations' baseline contracts still find them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'taptpay_r3_settlement_event_order') THEN
    RAISE EXCEPTION '0050 aborted: its objects already exist';
  END IF;
  -- Every event was written in the same transaction as its binding's transaction ID (C2).
  IF EXISTS (SELECT 1 FROM payment_settlement_events e JOIN payment_session_bindings b ON b.session_id = e.session_id
      WHERE b.provider_transaction_id IS NULL) THEN
    RAISE EXCEPTION '0050 aborted: a settlement event has no provider transaction on its binding';
  END IF;
END $$;

-- 1. Settlement events keep their card's transaction ID; a supersession names its decline (C2, C9).
ALTER TABLE payment_settlement_events
  ADD COLUMN provider_transaction_id text,
  ADD COLUMN supersedes_event_id uuid REFERENCES payment_settlement_events(id);
UPDATE payment_settlement_events e SET provider_transaction_id = b.provider_transaction_id
  FROM payment_session_bindings b WHERE b.session_id = e.session_id;
ALTER TABLE payment_settlement_events
  ALTER COLUMN provider_transaction_id SET NOT NULL,
  ADD CONSTRAINT payment_settlement_events_transaction_check CHECK (length(provider_transaction_id) BETWEEN 1 AND 200),
  ADD CONSTRAINT payment_settlement_events_supersedes_check CHECK (supersedes_event_id IS NULL OR outcome = 'approved');
-- At most one event per outcome per session (kept under 0036's name), and one non-declined event.
ALTER TABLE payment_settlement_events DROP CONSTRAINT payment_settlement_events_session_id_key;
ALTER TABLE payment_settlement_events ADD CONSTRAINT payment_settlement_events_session_id_key UNIQUE (session_id, outcome);
CREATE UNIQUE INDEX payment_settlement_events_session_final_uq ON payment_settlement_events(session_id) WHERE outcome <> 'declined';

-- A declined event never follows a final one; a final event after a decline is an approval that
-- names that decline. The binding row is locked first, so the rule holds on its own.
CREATE FUNCTION taptpay_r3_settlement_event_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE declined_id uuid; final_exists boolean;
BEGIN
  PERFORM 1 FROM payment_session_bindings WHERE session_id = NEW.session_id FOR UPDATE;
  SELECT id INTO declined_id FROM payment_settlement_events WHERE session_id = NEW.session_id AND outcome = 'declined';
  SELECT EXISTS (SELECT 1 FROM payment_settlement_events WHERE session_id = NEW.session_id AND outcome <> 'declined') INTO final_exists;
  IF NEW.outcome = 'declined' AND final_exists THEN
    RAISE EXCEPTION 'decline after a final settlement' USING ERRCODE = '23514', CONSTRAINT = 'payment_settlement_event_order_check';
  END IF;
  IF NEW.outcome <> 'declined' AND (NEW.supersedes_event_id IS DISTINCT FROM declined_id
      OR (declined_id IS NOT NULL AND NEW.outcome <> 'approved')) THEN
    RAISE EXCEPTION 'settlement does not follow its session' USING ERRCODE = '23514', CONSTRAINT = 'payment_settlement_event_order_check';
  END IF;
  IF NEW.outcome = 'declined' AND NEW.supersedes_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'a decline supersedes nothing' USING ERRCODE = '23514', CONSTRAINT = 'payment_settlement_event_order_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER settlement_event_order BEFORE INSERT ON payment_settlement_events FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_settlement_event_order();

-- C6: settlement events are append-only.
CREATE FUNCTION taptpay_r3_settlement_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'settlement events are append-only' USING ERRCODE = '23514', CONSTRAINT = 'payment_settlement_event_append_only_check';
END;
$$;
CREATE TRIGGER settlement_event_append_only BEFORE UPDATE OR DELETE ON payment_settlement_events FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_settlement_event_append_only();

-- 2. The registry holds one supersession claim per session besides its first claim (B1, C1).
ALTER TABLE provider_transaction_claims
  ADD COLUMN supersession boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT provider_transaction_claim_supersession_check CHECK (NOT supersession OR binding_session_id IS NOT NULL);
ALTER TABLE provider_transaction_claims DROP CONSTRAINT provider_transaction_claims_binding_session_id_key;
CREATE UNIQUE INDEX provider_transaction_claims_binding_uq ON provider_transaction_claims(binding_session_id, supersession)
  WHERE binding_session_id IS NOT NULL;
CREATE FUNCTION taptpay_r3_claim_binding_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owned provider_transaction_claims;
BEGIN
  IF NEW.provider_transaction_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO provider_transaction_claims(provider_transaction_id, binding_session_id, supersession)
    VALUES (NEW.provider_transaction_id, NEW.session_id, TG_OP = 'UPDATE' AND OLD.provider_transaction_id IS NOT NULL)
    ON CONFLICT DO NOTHING;
  SELECT * INTO owned FROM provider_transaction_claims WHERE provider_transaction_id = NEW.provider_transaction_id;
  IF owned.binding_session_id IS DISTINCT FROM NEW.session_id THEN
    RAISE EXCEPTION 'provider transaction belongs to another attempt' USING ERRCODE = '23505', CONSTRAINT = 'provider_transaction_claims_binding_uq';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER binding_provider_transaction_claim ON payment_session_bindings;
CREATE TRIGGER binding_provider_transaction_claim AFTER INSERT OR UPDATE OF provider_transaction_id ON payment_session_bindings
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_binding_transaction();

-- 3. A binding's transaction ID changes only by a supersession, checked at commit (C2).
CREATE FUNCTION taptpay_r3_binding_transaction_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider_transaction_id IS NOT NULL AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
    AND (NEW.provider_transaction_id IS NULL OR NEW.card_attempt_id IS NOT NULL) THEN
    RAISE EXCEPTION 'immutable provider transaction' USING ERRCODE = '23514', CONSTRAINT = 'payment_binding_supersession_check';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER payment_binding_transaction_immutable ON payment_session_bindings;
CREATE TRIGGER payment_binding_transaction_immutable BEFORE UPDATE ON payment_session_bindings FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_binding_transaction_change();
CREATE FUNCTION taptpay_r3_binding_supersession_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_id text; attempt_ok boolean; events_ok boolean;
BEGIN
  SELECT provider_transaction_id INTO current_id FROM payment_session_bindings WHERE session_id = NEW.session_id;
  IF NEW.payment_attempt_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM payment_attempts WHERE id = NEW.payment_attempt_id AND state = 'approved'
      AND provider_transaction_id = NEW.provider_transaction_id) INTO attempt_ok;
  ELSE
    -- Invoice attempts hold no transaction ID; their approval and the events below decide.
    SELECT EXISTS (SELECT 1 FROM invoice_payment_attempts WHERE id = NEW.invoice_attempt_id AND state = 'approved') INTO attempt_ok;
  END IF;
  SELECT EXISTS (SELECT 1 FROM payment_settlement_events f JOIN payment_settlement_events d ON d.id = f.supersedes_event_id
    WHERE f.session_id = NEW.session_id AND f.outcome = 'approved' AND f.provider_transaction_id = NEW.provider_transaction_id
      AND d.session_id = NEW.session_id AND d.outcome = 'declined' AND d.provider_transaction_id = OLD.provider_transaction_id) INTO events_ok;
  IF current_id IS DISTINCT FROM NEW.provider_transaction_id OR NOT attempt_ok OR NOT events_ok THEN
    RAISE EXCEPTION 'binding transaction changed without a supersession' USING ERRCODE = '23514', CONSTRAINT = 'payment_binding_supersession_check';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER binding_supersession_check AFTER UPDATE OF provider_transaction_id ON payment_session_bindings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.provider_transaction_id IS NOT NULL AND OLD.provider_transaction_id IS DISTINCT FROM NEW.provider_transaction_id)
  EXECUTE FUNCTION taptpay_r3_binding_supersession_check();

-- 4. Terminal attempts (C5): only a change of state is checked. Approved and cancelled are final;
--    declined may only become approved.
CREATE FUNCTION taptpay_r3_attempt_terminal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IS DISTINCT FROM NEW.state AND (OLD.state IN ('approved','cancelled') OR (OLD.state = 'declined' AND NEW.state <> 'approved')) THEN
    RAISE EXCEPTION 'terminal payment attempt' USING ERRCODE = '23514', CONSTRAINT = 'payment_attempt_terminal_state_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retail_attempt_terminal_state BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attempt_terminal_state();
CREATE TRIGGER invoice_attempt_terminal_state BEFORE UPDATE ON invoice_payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attempt_terminal_state();

-- 5. A retail attempt's transaction ID is written once, except declined -> approved. The other
--    write-once fields are unchanged (0037's list without provider_transaction_id).
DROP TRIGGER retail_attached_immutable ON payment_attempts;
CREATE TRIGGER retail_attached_immutable BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{processor_session_id,processor_x_id,return_state_hash,return_state_expires_at,expected_amount_cents,expected_currency,expected_merchant_reference,provider_environment,expected_provider_account,request_fingerprint,send_started_at}');
CREATE FUNCTION taptpay_r3_retail_transaction_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider_transaction_id IS NOT NULL AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
    AND NOT (OLD.state = 'declined' AND NEW.state = 'approved' AND NEW.provider_transaction_id IS NOT NULL) THEN
    RAISE EXCEPTION 'immutable attached identity' USING ERRCODE = '23514', CONSTRAINT = 'payment_attempt_transaction_supersession_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retail_transaction_supersession BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_retail_transaction_supersession();
COMMIT;
