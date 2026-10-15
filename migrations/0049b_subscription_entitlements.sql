-- D9: append-only evidence-bound service periods. No historical classifications
-- or access changes are inferred by this migration. Explicit activation follows
-- the real-target comparison and restore rehearsal.
BEGIN;
CREATE TABLE subscription_entitlement_control (
 id integer PRIMARY KEY DEFAULT 1,
 stage text NOT NULL DEFAULT 'legacy',
 activated_at timestamptz,
 review_digest text,
 CONSTRAINT entitlement_control_singleton CHECK(id=1),
 CONSTRAINT entitlement_control_stage CHECK(stage IN ('legacy','enforced')),
 CONSTRAINT entitlement_control_review CHECK(
  (stage='legacy' AND activated_at IS NULL AND review_digest IS NULL) OR
  (stage='enforced' AND activated_at IS NOT NULL AND isfinite(activated_at) AND review_digest ~ '^[0-9a-f]{64}$' AND review_digest IS NOT NULL))
);
INSERT INTO subscription_entitlement_control(id) VALUES(1);
CREATE TABLE subscription_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id integer NOT NULL,
 merchant_id integer NOT NULL,
 source text NOT NULL,
 source_key text NOT NULL UNIQUE,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 billing_attempt_id uuid UNIQUE REFERENCES subscription_billing_attempts(id),
 billing_history_id integer UNIQUE REFERENCES subscription_billing_history(id),
 review_digest text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT entitlement_tenant_fk FOREIGN KEY(subscription_id,merchant_id) REFERENCES merchant_subscriptions(id,merchant_id),
 CONSTRAINT entitlement_source_check CHECK(source IN ('paid','migration_grant','complimentary','trial')),
 CONSTRAINT entitlement_key_check CHECK(source_key ~ '^[a-z0-9:_-]{1,96}$'),
 CONSTRAINT entitlement_period_check CHECK(isfinite(period_start) AND isfinite(period_end) AND period_end>period_start AND isfinite(created_at)),
 CONSTRAINT entitlement_evidence_check CHECK(
  (source='paid' AND billing_attempt_id IS NOT NULL AND billing_history_id IS NULL AND review_digest IS NULL) OR
  (billing_attempt_id IS NULL AND review_digest IS NOT NULL AND review_digest ~ '^[0-9a-f]{64}$' AND
   ((source='paid' AND billing_history_id IS NOT NULL) OR (source<>'paid' AND billing_history_id IS NULL))))
);
CREATE INDEX subscription_entitlement_period_idx ON subscription_entitlements(subscription_id,period_end,period_start);
CREATE TABLE subscription_entitlement_revocations (
 entitlement_id uuid PRIMARY KEY REFERENCES subscription_entitlements(id),
 review_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT entitlement_revocation_review CHECK(review_digest ~ '^[0-9a-f]{64}$' AND isfinite(created_at))
);
CREATE FUNCTION taptpay_entitlement_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'entitlement_history_immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER entitlement_history_immutable BEFORE UPDATE OR DELETE ON subscription_entitlements FOR EACH ROW EXECUTE FUNCTION taptpay_entitlement_immutable();
CREATE TRIGGER entitlement_revocation_immutable BEFORE UPDATE OR DELETE ON subscription_entitlement_revocations FOR EACH ROW EXECUTE FUNCTION taptpay_entitlement_immutable();
CREATE FUNCTION taptpay_entitlement_source_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source='paid' THEN
  IF NEW.billing_attempt_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.subscription_billing_attempts a
    WHERE a.id=NEW.billing_attempt_id AND a.subscription_id=NEW.subscription_id AND a.merchant_id=NEW.merchant_id
     AND a.state='approved' AND a.applied_at IS NOT NULL AND a.kind IN ('activation','renewal')
     AND a.provider_transaction_id IS NOT NULL AND a.period_start=NEW.period_start AND a.period_end=NEW.period_end)
    THEN RAISE EXCEPTION 'entitlement_source_invalid' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.subscription_billing_history h
    WHERE h.id=NEW.billing_history_id AND h.subscription_id=NEW.subscription_id AND h.merchant_id=NEW.merchant_id
     AND h.status='succeeded' AND h.paid_at IS NOT NULL AND h.windcave_transaction_id IS NOT NULL
     AND h.billing_type='monthly_subscription' AND h.amount>0
     AND h.billing_period_start AT TIME ZONE 'UTC'=NEW.period_start AND h.billing_period_end AT TIME ZONE 'UTC'=NEW.period_end)
    THEN RAISE EXCEPTION 'entitlement_source_invalid' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER entitlement_source_guard BEFORE INSERT ON subscription_entitlements FOR EACH ROW EXECUTE FUNCTION taptpay_entitlement_source_guard();
CREATE FUNCTION taptpay_capture_paid_entitlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.state='approved' AND NEW.applied_at IS NOT NULL AND NEW.kind IN ('activation','renewal')
  AND (OLD.applied_at IS NULL OR OLD.state IS DISTINCT FROM NEW.state) THEN
  INSERT INTO public.subscription_entitlements(subscription_id,merchant_id,source,source_key,period_start,period_end,billing_attempt_id)
   VALUES(NEW.subscription_id,NEW.merchant_id,'paid','billing:'||NEW.id::text,NEW.period_start,NEW.period_end,NEW.id);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER subscription_paid_entitlement_capture AFTER UPDATE ON subscription_billing_attempts FOR EACH ROW EXECUTE FUNCTION taptpay_capture_paid_entitlement();
CREATE FUNCTION taptpay_entitlement_control_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.stage<>'legacy' OR NEW.stage<>'enforced' OR NEW.id<>OLD.id
  THEN RAISE EXCEPTION 'entitlement_control_transition_invalid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER entitlement_control_guard BEFORE UPDATE OR DELETE ON subscription_entitlement_control FOR EACH ROW EXECUTE FUNCTION taptpay_entitlement_control_guard();
COMMIT;
