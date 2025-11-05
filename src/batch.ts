import assert from 'node:assert';
import { type StreamBatch, StreamManager } from './stream-manager.js';

interface Call<Input, Output> {
  id: Input;
  resolve: Callback<Output>;
  reject: Callback;
}

export type Callback<T = unknown> = (value: T) => void;

export type RequestFn = (params: RequestParams) => Promise<unknown[]>;

export interface RequestParams {
  resolved: number[];
  streams?: StreamBatch<unknown, unknown>;
}

export class BatchScheduler {
  private sm: StreamManager<unknown, unknown> = new StreamManager();
  private calls: Call<number, unknown>[] = [];
  private promise?: Promise<void>;

  constructor(private request: RequestFn) {}

  private _schedule(): void {
    if (this.promise) {
      return;
    }
    this.promise = this._scheduleAsync();
  }

  private async _scheduleAsync(): Promise<void> {
    let calls: (Call<number, unknown> | null)[] | undefined;

    try {
      // wait until after the current tick, allowing all awaits to batch
      await new Promise(resolve => setTimeout(resolve, 0));

      // capture calls made in the current batch
      calls = this.calls;
      this.calls = [];

      const streams = this.sm.pop();

      // biome-ignore lint/style/noNonNullAssertion: calls always set before this
      const resolved = calls.map(call => call!.id);

      const results = await this.request({ resolved, streams });

      if (results.length !== calls.length) {
        throw Error('request returned more results than inputs');
      }

      for (let i = 0; i < results.length; ++i) {
        const result = results[i]!;

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

  async resolve(id: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._schedule();
      this.calls.push({ id, resolve, reject });
    });
  }

  consume(id: number): AsyncGenerator<unknown, unknown> {
    return this.sm.consume(id);
  }
}
