import { Deferred } from './deferred.js';

export class SplitAsyncIterable<T, TReturn, TNext>
  implements AsyncIterable<T, TReturn, TNext>
{
  private deferred: Deferred<TReturn> = new Deferred();
  private iterator?: AsyncIterator<T, TReturn, TNext>;

  constructor(source: AsyncGenerator<T, TReturn, TNext>) {
    const { deferred } = this;

    async function* wrapper(): AsyncGenerator<T, TReturn, TNext> {
      try {
        const result = yield* source;
        deferred.resolve(result);
        return result;
      } catch (error) {
        deferred.reject(error);
        throw error;
      }
    }

    this.iterator = wrapper()[Symbol.asyncIterator]();
  }

  split(): [SplitAsyncIterable<T, TReturn, TNext>, Promise<TReturn>] {
    return [this, this.deferred.promise];
  }

  iter(): AsyncIterator<T, TReturn, TNext> {
    return this[Symbol.asyncIterator]();
  }

  [Symbol.asyncIterator](): AsyncIterator<T, TReturn, TNext> {
    const { iterator } = this;
    if (iterator === undefined) {
      throw Error('iterator already taken');
    }
    this.iterator = undefined;
    return iterator;
  }
}
