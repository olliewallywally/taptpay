export const HTTP_WORK = Symbol.for('taptpay.httpWork');
/** Track accepted promises independently of socket/response lifetime. */
export class HttpWorkTracker {
  private active = new Set<Promise<unknown>>();
  private stopping = false;
  get draining() {
    return this.stopping;
  }
  stop() {
    this.stopping = true;
  }
  track(work: Promise<unknown>) {
    this.active.add(work);
    void work.finally(() => this.active.delete(work)).catch(() => undefined);
  }
  async drain() {
    while (this.active.size) await Promise.allSettled([...this.active]);
  }
}
