export enum DeferredState {
  PENDING = 0,
  RESOLVED = 1,
  REJECTED = 2,
}

export class Deferred<T> {
  private _state = DeferredState.PENDING;
  private _promise: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (reason?: unknown) => void;

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = value => {
        if (this._state === DeferredState.PENDING) {
          this._state = DeferredState.RESOLVED;
          resolve(value);
        }
      };
      this._reject = reason => {
        if (this._state === DeferredState.PENDING) {
          this._state = DeferredState.REJECTED;
          reject(reason);
        }
      };
    });
  }

  get state(): DeferredState {
    return this._state;
  }

  get settled(): boolean {
    return this._state !== DeferredState.PENDING;
  }

  get promise(): Promise<T> {
    return this._promise;
  }

  resolve(value: T): void {
    this._resolve(value);
  }

  reject(reason?: unknown): void {
    this._reject(reason);
  }
}
