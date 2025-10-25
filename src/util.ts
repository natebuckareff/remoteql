export const get = <T>(array: T[], index: number): T => {
  if (!Number.isSafeInteger(index)) {
    throw Error('index is not a safe integer');
  }

  if (index < 0 || index >= array.length) {
    throw Error('index out of bounds');
  }

  // biome-ignore lint/style/noNonNullAssertion: bounds checked
  return array[index]!;
}