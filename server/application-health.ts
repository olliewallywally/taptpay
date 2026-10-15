import { performance } from 'node:perf_hooks';

/** Process state only. Construction performs no I/O and starts no timers. */
export class ApplicationHealth {
  private bootComplete = false;
  private stopping = false;
  private pending?: { result: Promise<boolean> };
  private last?: { ok: boolean; at: number };
  constructor(
    private readonly checks: {
      database: () => Promise<boolean>;
      schemaValid: () => boolean;
      configValid: boolean;
      probeTimeoutMs?: number;
      cacheMs?: number;
    }
  ) {}
  get draining() {
    return this.stopping;
  }
  get booted() {
    return this.bootComplete;
  }
  completeBoot() {
    if (!this.stopping) this.bootComplete = true;
  }
  beginDrain() {
    this.stopping = true;
  }
  private eligible() {
    try {
      return (
        this.bootComplete &&
        !this.stopping &&
        this.checks.configValid &&
        this.checks.schemaValid()
      );
    } catch {
      return false;
    }
  }
  async ready(): Promise<boolean> {
    if (!this.eligible()) return false;
    if (
      this.last &&
      performance.now() - this.last.at < (this.checks.cacheMs ?? 1000)
    )
      return this.last.ok;
    if (!this.pending) {
      let settle!: (ok: boolean) => void,
        expired = false;
      const attempt = {
        result: new Promise<boolean>(resolve => {
          settle = resolve;
        }),
      };
      this.pending = attempt;
      const timer = setTimeout(() => {
        expired = true;
        this.last = { ok: false, at: performance.now() };
        settle(false);
        // Keep the physical attempt registered until it actually settles.
        // A timed-out query must not spawn an unbounded queue of replacements.
      }, this.checks.probeTimeoutMs ?? 1500);
      void Promise.resolve()
        .then(() => this.checks.database())
        .then(
          ok => ok === true,
          () => false
        )
        .then(ok => {
          clearTimeout(timer);
          if (!expired) {
            this.last = { ok, at: performance.now() };
            settle(ok);
          }
          if (this.pending === attempt) this.pending = undefined;
        });
    }
    const ok = await this.pending.result;
    return ok && this.eligible();
  }
}
