import { SplitAsyncIterator } from './split-async-iterator.js';

export class SplitAsyncIterable<T, TReturn, TNext>
  implements AsyncIterable<T, TReturn, TNext>
{
  private _iter: SplitAsyncIterator<T, TReturn, TNext> | null;

  constructor(source: AsyncIterator<T, TReturn, TNext>) {
    this._iter = new SplitAsyncIterator(source);
  }

  split(): [AsyncIterable<T, TReturn, TNext>, Promise<TReturn>] {
    if (this._iter === null) {
      throw Error('iterator already taken');
    }
    const promise = this._iter.promise;
    return [this, promise];
  }

  iter(): SplitAsyncIterator<T, TReturn, TNext> {
    return this[Symbol.asyncIterator]();
  }

  [Symbol.asyncIterator](): SplitAsyncIterator<T, TReturn, TNext> {
    const { _iter } = this;
    if (_iter === null) {
      throw Error('iterator already taken');
    }
    this._iter = null;
    return _iter;
  }
}
