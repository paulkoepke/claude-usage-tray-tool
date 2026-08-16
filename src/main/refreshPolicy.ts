// The renderer asks for an extra poll whenever a window's countdown hits
// zero, which can happen well before the server has actually rolled
// resets_at forward — either because of a transient endpoint error or
// because the server itself lags behind the timestamp it originally handed
// out. Polling on a short fixed interval until it resolves would risk
// hammering the endpoint past its documented 180s budget (see CLAUDE.md).
// Instead: allow exactly one extra "quick" poll per regular poll cycle. If
// that single retry still doesn't clear things up, the UI just sits with
// whatever it has until the next regular poll — or a manual "Refresh now" —
// comes along.
export class QuickRetryGate {
  private available = false

  /** Call once after every poll that runs on the fixed regular cadence. */
  armForRegularPoll(): void {
    this.available = true
  }

  /** Consumes the one-shot quick retry, if any is currently available. */
  tryConsume(): boolean {
    if (!this.available) return false
    this.available = false
    return true
  }
}
