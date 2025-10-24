type Callback<T> = (value: T) => void;

interface Call {
  input: any;
  resolve: Callback<any>;
  reject: Callback<any>;
}

export class BatchScheduler {
  private calls: Call[] = [];
  private promise?: Promise<void>;

  constructor(
    private request: (
      inputs: unknown[]
    ) => Promise<{ index: number; result: unknown }[]>
  ) {}

  private _schedule(): void {
    if (this.promise) {
      return;
    }
    this.promise = this._scheduleAsync();
  }

  private async _scheduleAsync(): Promise<void> {
    let calls: (Call | null)[] | undefined;

    try {
      // wait until after the current tick, allowing all awaits to batch
      await new Promise((resolve) => setTimeout(resolve, 0));

      // capture calls made in the current batch
      calls = this.calls;
      this.calls = [];

      const results = await this.request(calls as Call[]);

      for (const { index, result } of results) {
        const current = calls[index];
        calls[index] = null;

        if (current === undefined) {
          throw Error("call index out of range");
        } else if (current === null) {
          throw Error("call already handled");
        } else {
          try {
            current.resolve(result);
          } catch (error) {
            current.reject(error);
          }
        }
      }

      // check for any unhandled calls
      for (let i = 0; i < calls.length; i++) {
        const current = calls[i];
        if (current) {
          calls[i] = null;
          current.reject(Error("missing response"));
        }
      }
    } catch (error) {
      // fanout batch error to all calls
      if (calls) {
        for (const call of calls) {
          call?.reject(error);
        }
      }
    } finally {
      // ungate next batch
      this.promise = undefined;

      // flush the next batch, if there is one
      if (this.calls.length > 0) {
        // TODO: figure out how to exercise this path
        queueMicrotask(() => this._schedule());
      }
    }
  }

  send<T>(input: T, resolve: Callback<T>, reject: Callback<any>): void {
    this._schedule();
    this.calls.push({ input, resolve, reject });
  }
}

export class Rpc<T> {
  constructor(private batch: BatchScheduler, private input: T) {}

  async then<Result>(
    callback: (reason: T) => Result | Promise<Result>
  ): Promise<Result> {
    return new Promise((resolve, reject) => {
      const success = (value: T) => {
        return Promise.resolve()
          .then(() => callback(value))
          .then(resolve)
          .catch(reject);
      };
      this.batch.send(this.input, success, reject);
    });
  }
}

async function test() {
  const batch = new BatchScheduler((inputs) => {
    return Promise.resolve(
      inputs.map((input, index) => ({ index, result: input }))
    );
  });

  const a = new Rpc(batch, 42);
  const b = new Rpc(batch, "hello");
  const c = new Rpc(batch, true);

  const [x, y, z] = await Promise.all([a, b, c]);
  console.log(x, y, z);
}

test().then();
