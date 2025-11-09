import assert from 'node:assert';
import type { OpId } from './operation.js';
import type { ServerResponse } from './server-instance.js';
import { StreamManager } from './stream-manager.js';

interface Call<Input, Output> {
  id: Input;
  resolve: Callback<Output>;
  reject: Callback;
}

export type Callback<T = unknown> = (value: T) => void;
export type RequestFn = () => Promise<ServerResponse<unknown, unknown>>;

export class BatchScheduler {
  private sm: StreamManager<unknown, unknown> = new StreamManager();
  private calls: Call<OpId, unknown>[] = [];
  private promise?: Promise<void>;

  constructor(private request: RequestFn) {}

  private _schedule(): void {
    if (this.promise) {
      return;
    }
    this.promise = this._scheduleAsync();
  }

  private async _scheduleAsync(): Promise<void> {
    let calls: (Call<OpId, unknown> | null)[] | undefined;

    try {
      // wait until after the current tick, allowing all awaits to batch
      await new Promise(resolve => setTimeout(resolve, 0));

      // capture calls made in the current batch
      calls = this.calls;
      this.calls = [];

      const streams = this.sm.pop();
      const response = await this.request();

      let outputs: unknown[] | undefined;

      while (true) {
        const result = await response.next();

        if (result.done === true) {
          outputs = result.value;
          break;
        }

        if (streams) {
          await streams.push(result.value);
        }
      }

      outputs ??= [];

      if (outputs.length !== calls.length) {
        throw Error('request returned more results than inputs');
      }

      for (let i = 0; i < outputs.length; ++i) {
        const result = outputs[i]!;

        // biome-ignore lint/style/noNonNullAssertion: always set to nul _after_
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
      for (const call of calls) {
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

  async resolve(id: OpId): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._schedule();
      this.calls.push({ id, resolve, reject });
    });
  }

  consume(id: OpId): AsyncGenerator<unknown, unknown> {
    this._schedule();
    return this.sm.consume(id);
  }
}
