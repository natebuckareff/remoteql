/** biome-ignore-all lint/suspicious/noExplicitAny: need any for inference */

import type { Simplify } from 'typekind';
import type { AnyRouterApi, InferRouterType } from '../api.js';
import type { Rpc } from '../rpc-type.js';
import type { DefineCallback } from './client-dev.js';
import type { SplitAsyncIterable } from './split-async-iterable.js';

// need any to correctly infer return types at usage, but set T to unknown for
// typing internal code
export type OperationBuilderReturn<T = any> = Rpc<T> | Record<string, Rpc<T>>;

export type InferOperationOutput<T> = T extends Rpc<infer U>
  ? U extends AsyncGenerator<infer T, infer TReturn, infer TNext>
    ? SplitAsyncIterable<T, TReturn, TNext>
    : Promise<U>
  : never;

export type InferOperationResult<T> = T extends Rpc<infer U>
  ? U extends AsyncGenerator<infer T, infer TReturn, infer TNext>
    ? SplitAsyncIterable<T, TReturn, TNext>
    : Promise<U>
  : Simplify<{ [K in keyof T]: InferOperationOutput<T[K]> }>;

export interface ClientNextConfig<Router extends AnyRouterApi> {
  router: Router;
}

export interface IClient<Router extends AnyRouterApi> {
  define<
    Args extends any[],
    Params extends Record<string, any>,
    Return extends OperationBuilderReturn,
  >(
    name: string,
    prepare: (...args: Args) => Params,
    callback: DefineCallback<Router, Params, Return>,
  ): (...args: Args) => InferOperationResult<Return>;

  define<
    Args extends any[],
    Params extends Record<string, any>,
    Return extends OperationBuilderReturn,
  >(
    name: string,
    prepare: (...args: Args) => Params,
    keys: () => (keyof Params)[],
    callback: DefineCallback<Router, Params, Return>,
  ): (...args: Args) => InferOperationResult<Return>;

  // TODO: will probably remove for tree-shaking
  get api(): Rpc<InferRouterType<Router>>;
}
