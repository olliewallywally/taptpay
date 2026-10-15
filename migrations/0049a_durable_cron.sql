-- R6: orchestration history only. No provider/card/notification bodies or entitlement changes.
BEGIN;
CREATE FUNCTION taptpay_cron_metrics_valid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(value)='object' AND octet_length(value::text)<=4096
 AND NOT EXISTS (
  SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(value)='object' THEN value ELSE '{}'::jsonb END) AS e
  WHERE NOT CASE
   WHEN e.key IN ('scannerAvailable','beforeCutoff') THEN jsonb_typeof(e.value)='boolean'
   WHEN e.key IN ('generated','skipped','errors','dispatched','failed','markedOverdue','sent','processed','charged','expired','deleted','scanned','clean','blocked','noVerdict','uncertain','count')
    THEN CASE WHEN jsonb_typeof(e.value)='number' AND e.value::text ~ '^(0|[1-9][0-9]{0,9})$'
      THEN (e.value::text)::numeric<=2147483647 ELSE false END
   ELSE false END
 );
$$;
CREATE TABLE cron_runs (
 id uuid PRIMARY KEY,
 owner uuid NOT NULL,
 scheduled_for timestamptz NOT NULL,
 attempt integer NOT NULL,
 state text NOT NULL DEFAULT 'running',
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_expires_at timestamptz NOT NULL,
 deadline_at timestamptz NOT NULL,
 finished_at timestamptz,
 duration_ms bigint,
 CONSTRAINT cron_run_slot_attempt_uq UNIQUE(scheduled_for,attempt),
 CONSTRAINT cron_run_attempt_check CHECK(attempt>=1 AND attempt<=1000),
 CONSTRAINT cron_run_state_check CHECK(state IN ('running','succeeded','failed','abandoned')),
 CONSTRAINT cron_run_times_check CHECK(isfinite(started_at) AND isfinite(scheduled_for) AND deadline_at>started_at AND deadline_at<=started_at+interval '240 seconds' AND lease_expires_at>=started_at AND lease_expires_at<=deadline_at AND heartbeat_at>=started_at AND heartbeat_at<=deadline_at),
 CONSTRAINT cron_run_finish_check CHECK((state='running' AND finished_at IS NULL AND duration_ms IS NULL) OR (state<>'running' AND finished_at IS NOT NULL AND finished_at>=started_at AND duration_ms IS NOT NULL AND duration_ms>=0))
);
CREATE UNIQUE INDEX cron_one_running_uq ON cron_runs(state) WHERE state='running';
CREATE INDEX cron_run_latest_idx ON cron_runs(started_at DESC,id);
CREATE INDEX cron_run_success_idx ON cron_runs(finished_at DESC) WHERE state='succeeded';
CREATE TABLE cron_jobs (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES cron_runs(id),
 name text NOT NULL,
 state text NOT NULL DEFAULT 'running',
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 duration_ms bigint,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 error_code text,
 resolved_at timestamptz,
 review_digest text,
 CONSTRAINT cron_job_run_name_uq UNIQUE(run_id,name),
 CONSTRAINT cron_job_name_check CHECK(name IN ('subscriptionBilling','generate','tradesGenerate','dispatch','tradesDispatch','overdue','tradesOverdue','reminders','tradesReminders','dailyPayoutNotifications','uploadScans','uploadRetention')),
 CONSTRAINT cron_job_state_check CHECK(state IN ('running','succeeded','failed','held','skipped','resolved_complete','resolved_retry')),
 CONSTRAINT cron_job_metrics_check CHECK(taptpay_cron_metrics_valid(metrics)),
 CONSTRAINT cron_job_error_check CHECK(error_code IS NULL OR error_code IN ('job_failed','lease_expired','ownership_lost','held_job','already_completed')),
 CONSTRAINT cron_job_finish_check CHECK(isfinite(started_at) AND ((state='running' AND finished_at IS NULL AND duration_ms IS NULL) OR (state<>'running' AND finished_at IS NOT NULL AND finished_at>=started_at AND duration_ms IS NOT NULL AND duration_ms>=0))),
 CONSTRAINT cron_job_resolution_check CHECK((state IN ('resolved_complete','resolved_retry') AND resolved_at IS NOT NULL AND review_digest IS NOT NULL AND review_digest ~ '^[0-9a-f]{64}$') OR (state NOT IN ('resolved_complete','resolved_retry') AND resolved_at IS NULL AND review_digest IS NULL))
);
CREATE UNIQUE INDEX cron_job_active_name_uq ON cron_jobs(name) WHERE state IN ('running','held');
CREATE INDEX cron_job_run_idx ON cron_jobs(run_id,started_at,id);
CREATE INDEX cron_job_held_idx ON cron_jobs(started_at) WHERE state='held';
CREATE FUNCTION taptpay_cron_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'cron_history_immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='cron_runs' THEN
  IF OLD.state<>'running' OR
   (to_jsonb(NEW)-ARRAY['state','heartbeat_at','lease_expires_at','finished_at','duration_ms']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['state','heartbeat_at','lease_expires_at','finished_at','duration_ms'])
   THEN RAISE EXCEPTION 'cron_history_immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state='held' THEN
   IF NEW.state NOT IN ('resolved_complete','resolved_retry') OR
    (to_jsonb(NEW)-ARRAY['state','resolved_at','review_digest']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','resolved_at','review_digest'])
    THEN RAISE EXCEPTION 'cron_history_immutable' USING ERRCODE='23514'; END IF;
  ELSIF OLD.state<>'running' OR
   (to_jsonb(NEW)-ARRAY['state','finished_at','duration_ms','metrics','error_code']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['state','finished_at','duration_ms','metrics','error_code'])
   THEN RAISE EXCEPTION 'cron_history_immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cron_run_history_guard BEFORE UPDATE OR DELETE ON cron_runs FOR EACH ROW EXECUTE FUNCTION taptpay_cron_history_guard();
CREATE TRIGGER cron_job_history_guard BEFORE UPDATE OR DELETE ON cron_jobs FOR EACH ROW EXECUTE FUNCTION taptpay_cron_history_guard();
COMMIT;
