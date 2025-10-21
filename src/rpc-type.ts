/** @internal */
export const rpcImplSymbol: unique symbol = Symbol();

export class RpcImpl {
  [rpcImplSymbol]: true;
}

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

export type ConstrainPrimitive<T> = IsPlainPrimitive<T>;

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
    ? number extends T["length"]
      ? RpcArray<T[number]>
      : RpcTuple<T>
    : T extends RpcImpl
    ? RpcClient<T>
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

export type RpcClient<T extends RpcImpl> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer ReturnType
    ? RpcFunction<Args, ReturnType>
    : never;
};

/** @internal */
declare const rpcArraySymbol: unique symbol;

export type RpcObject<T extends object> = T extends
  | Function
  | ReadonlyArray<any>
  ? never
  : { [K in keyof T]: Rpc<T[K]> };

export type RpcArray<E> = {
  [Index in Extract<keyof E[], number>]: Rpc<E | undefined>;
} & {
  at(index: number): Rpc<E>;
  map<const U>(
    callback: (value: Rpc<E>, index: Rpc<number>) => U
  ): U extends Rpc<infer E> ? Rpc<E[]> : Rpc<U[]>;
};

export type RpcTuple<T extends readonly unknown[]> = RpcArray<T[number]> & {
  [K in keyof T]: Rpc<T[K]>;
};
