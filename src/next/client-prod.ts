/** biome-ignore-all lint/suspicious/noExplicitAny: need any for inference */

import type { AnyRouterApi, InferRouterType } from '../api.js';
import type { Rpc } from '../rpc-type.js';
import type {
  ClientNextConfig,
  IClient,
  InferOperationResult,
  OperationBuilderReturn,
} from './client-type.js';
import type { TransportPersistentRequest } from './transport.js';

export type DefineCallback<
  Router extends AnyRouterApi,
  Params extends Record<string, unknown>,
  Return extends OperationBuilderReturn,
> = (api: Rpc<InferRouterType<Router>>, params: Params) => Return;

export class ClientProd<Router extends AnyRouterApi>
  implements IClient<Router>
{
  private operations: Record<string, (...args: any[]) => any> = {};

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
    _callbackOrKeysArg:
      | DefineCallback<Router, Params, Return>
      | (() => (keyof Params)[]),
    _callbackArg?: DefineCallback<Router, Params, Return>,
  ): (...args: Args) => InferOperationResult<Return> {
    let operation = this.operations[name];

    if (operation) {
      return operation;
    }

    operation = (...args: Args): InferOperationResult<Return> => {
      const params = prepare(...args);
      const request: TransportPersistentRequest = {
        operation: name,
        params,
      };
      throw Error('todo: send to transport');
    };

    this.operations[name] = operation;

    return operation;
  }

  get api(): Rpc<InferRouterType<Router>> {
    throw Error('todo: implement unbatched requests');
  }
}
