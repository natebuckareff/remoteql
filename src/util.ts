import { inspect } from 'node:util';

export type Thenable<T> = {
  then<Result = T>(
    onfulfilled?:
      | ((value: T) => Result | PromiseLike<Result>)
      | undefined
      | null,
  ): Promise<Result>;
};

export const unwrap = <T>(value: T | null | undefined): T => {
  if (value == null) {
    throw Error(`value is ${value === undefined ? 'undefined' : 'null'}`);
  }
  return value;
};

export function deepLog(value: unknown) {
  console.log(inspect(value, false, null, true));
}

export const isThenable = (value: unknown): value is Thenable<unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
