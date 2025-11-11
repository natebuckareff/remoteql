import { Deferred } from './deferred.js';

export class IteratorCancelError extends Error {
  constructor(message = 'iterator cancelled', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IteratorCancelError';
  }
}

export class SplitAsyncIterator<T, TReturn, TNext>
  implements AsyncIterator<T, TReturn, TNext>
{
  private deferred: Deferred<TReturn> = new Deferred();
  private inFlight: boolean = false;
  private completed?: { value: TReturn | undefined };

  constructor(private source: AsyncIterator<T, TReturn, TNext>) {}

  get promise(): Promise<TReturn> {
    return this.deferred.promise;
  }

  private begin(): void {
    if (this.inFlight) {
      throw Error('concurrent iteration');
    }
    this.inFlight = true;
  }

  private end(): void {
    this.inFlight = false;
  }

  private complete(value: TReturn): void {
    this.completed = { value };
    this.deferred.resolve(value);
  }

  private completeFatally(error: unknown): void {
    this.completed = { value: undefined };
    this.deferred.reject(error);
  }

  next(...[value]: [] | [TNext]): Promise<IteratorResult<T, TReturn>> {
    return this._next(value as TNext);
  }

  private async _next(value: TNext): Promise<IteratorResult<T, TReturn>> {
    if (this.completed) {
      return {
        done: true,
        value: this.completed.value as TReturn,
      };
    }

    this.begin();
    try {
      const result = await this.source.next(value);
      if (result.done) {
        this.complete(result.value);
      }
      return result;
    } catch (error) {
      this.completeFatally(error);
      throw error;
    } finally {
      this.end();
    }
  }

  async throw(e?: unknown): Promise<IteratorResult<T, TReturn>> {
    if (this.completed) {
      return {
        done: true,
        value: this.completed.value as TReturn,
      };
    }

    this.begin();
    if (this.source.throw) {
      try {
        const result = await this.source.throw(e);
        if (result.done) {
          this.complete(result.value);
        }
        return result;
      } catch (error) {
        this.completeFatally(error);
        throw error;
      } finally {
        this.end();
      }
    } else {
      const reason =
        e === undefined
          ? new IteratorCancelError('iterator cancelled via throw()')
          : e;

      try {
        this.completeFatally(reason);
      } finally {
        this.end();
      }
      throw reason;
    }
  }

  async return(
    value?: TReturn | PromiseLike<TReturn>,
  ): Promise<IteratorResult<T, TReturn>> {
    if (this.completed) {
      return {
        done: true,
        value: this.completed.value as TReturn,
      };
    }

    this.begin();
    if (this.source.return) {
      try {
        let result = await this.source.return(value);
        while (!result.done) {
          result = await this.source.next(undefined as TNext);
        }
        const v = result.value;
        this.complete(v);
        return { done: true, value: v };
      } catch (error) {
        this.completeFatally(error);
        throw error;
      } finally {
        this.end();
      }
    } else {
      try {
        const v = (await value) as TReturn;
        this.complete(v);
        return { done: true, value: v };
      } catch (error) {
        this.completeFatally(error);
        throw error;
      } finally {
        this.end();
      }
    }
  }
}
