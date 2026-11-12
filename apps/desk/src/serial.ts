/**
 * Runs async tasks one at a time, in call order. The desk wraps every fill path in one of these so
 * two fills can never both pass a budget or exposure check that only one of them fits.
 */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;

  /** Tasks started or waiting to start. */
  get pending(): number {
    return this.queued;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.queued += 1;
    const settle = () => {
      this.queued -= 1;
    };
    const result = this.tail.then(task, task).finally(settle);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
