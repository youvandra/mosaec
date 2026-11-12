/**
 * Runs async tasks one at a time, in call order. The desk wraps every fill path in one of these so
 * two fills can never both pass a budget or exposure check that only one of them fits.
 */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
