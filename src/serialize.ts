import { Ref } from "./plan";

export type Serialized =
  | null
  | boolean
  | number
  | string
  | ["undefined"]
  | ["bigint", string]
  | ["date", number]
  | [Serialized[]]
  | { [key: string]: Serialized }
  | [number];

export interface SerializedPlan {
  frame: SerializedFrame;
  outputs: number[];
}

export type SerializedFrame = Record<
  number,
  SerializedOperation | SerializedBlock
>;

export type SerializedOperation =
  | ["let", Serialized]
  | ["get", ...(number | string)[]]
  | ["call", (number | string)[], ...number[]]
  | ["map", (number | string)[], number];

export interface SerializedBlock {
  params: number[];
  frame: SerializedFrame;
  outputs: number[];
}

const INTEGER_REGEX = /^-?[0-9]+$/;

export function serialize(input: unknown): Serialized {
  const typeOf = typeof input;
  if (typeOf === "object") {
    if (input === null) {
      return null;
    } else if (Array.isArray(input)) {
      return [input.map((x) => serialize(x))];
    } else if (input instanceof Ref) {
      return [input.get()];
    } else {
      const output: Record<string, Serialized> = {};
      for (const [key, value] of Object.entries(input as object)) {
        output[key] = serialize(value);
      }
      return output;
    }
  } else if (typeOf === "undefined") {
    return ["undefined"];
  } else if (typeOf === "bigint") {
    return ["bigint", (input as bigint).toString()];
  } else if (input instanceof Date) {
    return ["date", (input as Date).getTime()];
  } else {
    switch (typeOf) {
      case "boolean":
      case "number":
      case "string":
        return input as boolean | number | string;

      case "symbol":
      case "function":
        throw Error(`value cannot be serialized "${typeOf}"`);
    }
  }
}

export function deserialize(input: Serialized): unknown {
  const typeOf = typeof input;
  if (typeOf === "object") {
    if (input === null) {
      return input;
    } else if (Array.isArray(input)) {
      const length = input.length;

      if (length === 1) {
        const [value] = input;

        if (value === "undefined") {
          return undefined;
        } else if (Array.isArray(value)) {
          return value.map((x) => deserialize(x));
        } else if (typeof value === "number") {
          return new Ref(value);
        } else {
          throw Error("invalid 1-tuple serialized value");
        }
      } else if (length === 2) {
        const [tag, value] = input;

        if (tag === "bigint") {
          if (typeof value !== "string") {
            throw Error("invalid serialized bigint");
          }
          if (!INTEGER_REGEX.test(value)) {
            throw Error("non-numeric serialized bigint value");
          }
          return BigInt(value);
        } else if (tag === "date") {
          if (typeof value !== "number") {
            throw Error("non-numeric serialized date value");
          }
          return new Date(value);
        } else {
          throw Error("invalid 2-tuple serialized value");
        }
      } else {
        throw Error("invalid serialized array");
      }
    } else {
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input as object)) {
        output[key] = deserialize(value);
      }
      return output;
    }
  } else {
    switch (typeOf) {
      case "boolean":
      case "number":
      case "string":
        return input;

      case "bigint":
      case "symbol":
      case "undefined":
      case "function":
        throw Error(`cannot deserialize value ${typeOf}`);
    }
  }
}
