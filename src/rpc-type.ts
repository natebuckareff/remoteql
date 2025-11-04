// biome-ignore-all lint/suspicious/noExplicitAny: used to match all possible types
// biome-ignore-all lint/suspicious/noConfusingVoidType: used to match void return types
// biome-ignore-all lint/complexity/noBannedTypes: used to match Function

export type PlainPrimitive =
  | undefined
  | null
  | boolean
  | number
  | string
  | bigint;

export type IsPlainPrimitive<T> = T extends
  | null
  | boolean
  | number
  | string
  | bigint
  ? T
  : never;

export type Mappable<E> = {
  map<U>(callback: (value: Rpc<E>) => U): Rpc<U>;
};

export type ConstrainPrimitive<T> = Mappable<T> & IsPlainPrimitive<T>;

export type Resolved<T> = T extends Rpc<infer U> ? U : never;

/** @internal */
declare const rpcPromiseSymbol: unique symbol;

export type RpcPromiseMarker<T> = {
  readonly [rpcPromiseSymbol]: T;
};

export type Rpc<T> = RpcPromiseMarker<T> &
  ([T] extends [PlainPrimitive]
    ? ConstrainPrimitive<T>
    : T extends (...args: infer Args) => infer ReturnType
      ? RpcFunction<Args, ReturnType>
      : T extends readonly [...any]
        ? number extends T['length']
          ? RpcArray<T[number]>
          : RpcTuple<T>
        : T extends object
          ? RpcObject<T>
          : void extends T
            ? void
            : never);

export type RpcFunction<Args extends any[], ReturnType> = (
  ...args: RpcParams<Args>
) => Rpc<Awaited<ReturnType>>;

export type RpcParams<Params extends any[]> = {
  [K in keyof Params]: Params[K] | Rpc<Params[K]>;
};

export type RpcObject<T extends object> = Mappable<T> &
  (T extends Function | ReadonlyArray<any>
    ? never
    : { [K in keyof T]: Rpc<T[K]> });

export type RpcArray<E> = {
  [Index in Extract<keyof E[], number>]: Rpc<E | undefined>;
} & {
  at(index: number): Rpc<E>;
  map<U>(
    callback: (value: Rpc<E>, index: Rpc<number>) => U,
  ): U extends Rpc<infer E> ? Rpc<E[]> : Rpc<U[]>;
};

export type RpcTuple<T extends readonly unknown[]> = RpcArray<T[number]> & {
  [K in keyof T]: Rpc<T[K]>;
};
