import assert from 'node:assert';
import type { AnyCodec, Json } from 'typekind';
import type { OpId } from './operation.js';
import type { ServerResponse } from './server-instance.js';
import { StreamManager } from './stream-manager.js';

interface Call<Input, Output> {
  id: Input;
  resolve: Callback<Output>;
  reject: Callback;
  codec: AnyCodec;
}

export type Callback<T = unknown> = (value: T) => void;
export type RequestFn = () => Promise<ServerResponse>;

// TODO: rename to batch-scheduler.ts
export class BatchScheduler {
  private sm: StreamManager<unknown, unknown> = new StreamManager();
  private calls: Call<OpId, unknown>[] = [];
  private promise?: Promise<void>;

  constructor(
    private request: RequestFn,
    private disableScheduling: boolean = false,
  ) {}

  private _schedule(): void {
    if (this.disableScheduling || this.promise) {
      return;
    }
    this.promise = this.scheduleAsync();
  }

  private async scheduleAsync(): Promise<void> {
    // wait until after the current tick, allowing all awaits to batch
    await new Promise(resolve => setTimeout(resolve, 0));
    return this.execute();
  }

  private async execute(): Promise<void> {
    let calls: (Call<OpId, unknown> | null)[] | undefined;

    try {
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
          const deserialized = current.codec.deserialize(result as Json);
          current.resolve(deserialized);
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

  flush(): void {
    if (this.promise) {
      throw Error('batch already scheduled');
    }
    this.promise = this.execute();
  }

  async resolve(id: OpId, codec: AnyCodec): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._schedule();
      this.calls.push({ id, resolve, reject, codec });
    });
  }

  consume(
    id: OpId,
    yieldCodec: AnyCodec,
    returnCodec: AnyCodec,
  ): AsyncGenerator<unknown, unknown> {
    this._schedule();
    return this.sm.consume(id, yieldCodec, returnCodec);
  }
}
