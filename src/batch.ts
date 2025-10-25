import assert from 'node:assert';

interface Call<Input, Output> {
  input: Input;
  resolve: Callback<Output>;
  reject: Callback;
}

export type Callback<T = unknown> = (value: T) => void;

export class BatchScheduler<Input, Output = Input> {
  private calls: Call<Input, Output>[] = [];
  private promise?: Promise<void>;

  constructor(private request: (inputs: Input[]) => Promise<Output[]>) {}

  private _schedule(): void {
    if (this.promise) {
      return;
    }
    this.promise = this._scheduleAsync();
  }

  private async _scheduleAsync(): Promise<void> {
    let calls: (Call<Input, Output> | null)[] | undefined;

    try {
      // wait until after the current tick, allowing all awaits to batch
      await new Promise(resolve => setTimeout(resolve, 0));

      // capture calls made in the current batch
      calls = this.calls;
      this.calls = [];

      const inputs = calls.map(call => call!.input);
      const results = await this.request(inputs);

      if (results.length !== calls.length) {
        throw Error('request returned more results than inputs');
      }

      for (let i = 0; i < results.length; ++i) {
        const result = results[i]!;
        const current = calls[i]!;
        calls[i] = null;

        try {
          current.resolve(result);
        } catch (error) {
          current.reject(error);
        }
      }
    } catch (error) {
      assert(calls !== undefined, 'calls always set before any error');

      // fanout batch error to all calls
      for (const call of calls!) {
        call?.reject(error);
      }
    } finally {
      // ungate next batch
      this.promise = undefined;

      // flush the next batch, if there is one
      if (this.calls.length > 0) {
        queueMicrotask(() => this._schedule());
      }
    }
  }

  send(input: Input, resolve: Callback<Output>, reject: Callback): void {
    this._schedule();
    this.calls.push({ input, resolve, reject });
  }
}
