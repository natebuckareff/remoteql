import type { AnyCodec } from 'typekind';
import type {
  AnyRouterApi,
  AnyServiceApi,
  HandlerApi,
  HandlerApis,
  InferServiceType,
  ServiceApi,
} from './api.js';
import { type ServerConfig, ServerInstance } from './server-instance.js';

export type InferRouter<Context, T extends AnyRouterApi> = {
  [K in keyof T['routes']]: T['routes'][K] extends AnyServiceApi
    ? ServiceInstance<Context, T['routes'][K]>
    : InferRouter<Context, Extract<T['routes'][K], AnyRouterApi>>;
};

export type InferApi<Context, T extends AnyServiceApi> = {
  [K in keyof T['handlers']]?: T['handlers'][K] extends HandlerApi<
    infer Input,
    infer Output
  >
    ? Handler<Context, Input, Output>
    : never;
};

export type Handler<
  Context,
  Input extends AnyCodec | void,
  Output extends AnyCodec | void,
> = (params: {
  cx: Context;
  input: Input extends AnyCodec ? Input['Type'] : void;
}) => Promise<Output extends AnyCodec ? Output['Type'] : void>;

export type InjectFn = <T extends ServiceApi<HandlerApis>>(
  api: T,
) => InferServiceType<T>;

export interface ContextParams {
  inject: InjectFn;
}

export function initServer<Context = unknown>(): ServerBuilder<Context> {
  return new ServerBuilder();
}

export class ServerBuilder<Context> {
  public contextFactory?: (params: ContextParams) => Promise<Context>;

  context<T>(
    callback: (params: ContextParams) => Promise<T>,
  ): ServerBuilder<T> {
    const converted = this as unknown as ServerBuilder<T>;
    converted.contextFactory = callback;
    return converted;
  }

  router<Routes extends AnyRouterApi>(
    routes: Routes,
  ): RouterInstance<Context, Routes> {
    return new RouterInstance(routes);
  }

  service<Api extends AnyServiceApi>(api: Api): ServiceInstance<Context, Api> {
    return new ServiceInstance(api);
  }

  server<Routes extends AnyRouterApi>(
    config: ServerConfig<Context, Routes>,
  ): ServerInstance<Context, Routes> {
    return new ServerInstance({
      ...config,
      context: this.contextFactory,
    });
  }
}

export type AnyRoute<Context> =
  | RouterInstance<Context, AnyRouterApi>
  | ServiceInstance<Context, AnyServiceApi>;

export class RouterInstance<Context, Routes extends AnyRouterApi> {
  public impl?: InferRouter<Context, Routes>;

  constructor(public readonly routes: Routes) {}

  *entries(): IterableIterator<[string, AnyRoute<Context>]> {
    if (!this.impl) {
      return;
    }
    yield* Object.entries(this.impl);
  }

  bind<Impl extends InferRouter<Context, Routes>>(impl: Impl): this {
    this.impl = { ...this.impl, ...impl };
    return this;
  }
}

export class ServiceInstance<Context, Api extends AnyServiceApi> {
  public impl?: InferApi<Context, Api>;

  constructor(public readonly api: Api) {}

  bind<Impl extends InferApi<Context, Api>>(impl: Impl): this {
    this.impl = { ...this.impl, ...impl };
    return this;
  }
}
