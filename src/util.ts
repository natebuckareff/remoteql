export type Thenable<T> = {
  then<Result = T>(
    onfulfilled?:
      | ((value: T) => Result | PromiseLike<Result>)
      | undefined
      | null,
  ): Promise<Result>;
};

export const get = <T>(array: T[], index: number): T => {
  if (!Number.isSafeInteger(index)) {
    throw Error('index is not a safe integer');
  }

  if (index < 0 || index >= array.length) {
    throw Error('index out of bounds');
  }

  // biome-ignore lint/style/noNonNullAssertion: bounds checked
  return array[index]!;
};

export const isThenable = (value: unknown): value is Thenable<unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
