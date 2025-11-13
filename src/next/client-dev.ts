/** biome-ignore-all lint/suspicious/noExplicitAny: need any for inference */

import type { AnyRouterApi, InferRouterType } from '../api.js';
import { HandlerApi, StreamApi } from '../api.js';
import type { Rpc } from '../rpc-type.js';
import type {
  ClientNextConfig,
  IClient,
  InferOperationResult,
  OperationBuilderReturn,
} from './client-type.js';
import { type OpId, PlanBuilder } from './plan-builder.js';
import { isRpcProxy, ProxyState, unwrapOpProxy } from './proxy.js';
import type { TransportPlanRequest } from './transport.js';

export type DefineCallback<
  Router extends AnyRouterApi,
  Params extends Record<string, unknown>,
  Return extends OperationBuilderReturn,
> = (api: Rpc<InferRouterType<Router>>, params: Params) => Return;

export class ClientDev<Router extends AnyRouterApi> implements IClient<Router> {
  private definedOperations: string[] = [];

  constructor(public readonly config: ClientNextConfig<Router>) {}

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

  define<
    Args extends any[],
    Params extends Record<string, any>,
    Return extends OperationBuilderReturn,
  >(
    name: string,
    prepare: (...args: Args) => Params,
    callbackOrKeysArg:
      | DefineCallback<Router, Params, Return>
      | (() => (keyof Params)[]),
    callbackArg?: DefineCallback<Router, Params, Return>,
  ): (...args: Args) => InferOperationResult<Return> {
    const getKeys =
      callbackArg === undefined
        ? undefined
        : (callbackOrKeysArg as () => (keyof Params)[]);

    const callback = callbackArg
      ? (callbackArg as DefineCallback<Router, Params, Return>)
      : (callbackOrKeysArg as DefineCallback<Router, Params, Return>);

    if (this.definedOperations.includes(name)) {
      throw Error('operation already defined');
    }

    const operation = (...args: Args): InferOperationResult<Return> => {
      const params = prepare(...args);
      const builder = new PlanBuilder();
      const api = this.config.router;
      const proxy = ProxyState.createProxy<Router>(undefined, builder, api);
      // set T to unknown to prevent everything from collapsing to any and
      // maintain some type safety here
      const result = callback(proxy, params) as OperationBuilderReturn<unknown>;

      let streams: TransportPlanRequest['streams'];
      let outputs: TransportPlanRequest['outputs'];

      if (isRpcProxy(result)) {
        const { api, op } = unwrapOpProxy(result);

        if (api instanceof HandlerApi) {
          outputs = op.id;
        } else if (api instanceof StreamApi) {
          streams = op.id;
        } else {
          throw Error('expected handler or stream');
        }
      } else {
        let s: Record<string, OpId> | undefined;
        let o: Record<string, OpId> | undefined;

        for (const [key, value] of Object.entries(result)) {
          const { api, op } = unwrapOpProxy(value);

          if (api instanceof HandlerApi) {
            o ??= {};
            o[key] = op.id;
          } else if (api instanceof StreamApi) {
            s ??= {};
            s[key] = op.id;
          } else {
            throw Error('expected handler or stream');
          }
        }

        if (s) streams = s;
        if (o) outputs = o;
      }

      const keys = getKeys?.() as string[] | undefined;

      const request: TransportPlanRequest = {
        operation: name,
        params,
        keys,
        plan: {}, // XXX
        streams,
        outputs,
      };

      throw Error('todo: send to transport');
    };

    this.definedOperations.push(name);

    return operation;
  }

  get api(): Rpc<InferRouterType<Router>> {
    // TODO: create a proxy to construct a single, unbatched request

    // TODO: how to tree-shake

    throw Error('todo: implement unbatched requests');
  }
}
