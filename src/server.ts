import type { AnyCodec } from 'typekind';
import type { AnyServiceApi, HandlerApi } from './api.js';

export type InferApi<T extends AnyServiceApi> = {
  [K in keyof T['handlers']]: T['handlers'][K] extends HandlerApi<
    infer Input,
    infer Output
  >
    ? (params: {
        input: Input['Type'];
      }) => Promise<Output extends AnyCodec ? Output['Type'] : void>
    : never;
};

export interface ServerSpec {
  services: {
    [name: string]: ServiceBuilder<AnyServiceApi>;
  };
}

export class ServerInstance {
  constructor(public readonly spec: ServerSpec) {}
}

export class ServerBuilder {
  service<const Api extends AnyServiceApi>(api: Api): ServiceBuilder<Api> {
    return new ServiceBuilder(api);
  }

  server(spec: ServerSpec): ServerInstance {
    return new ServerInstance(spec);
  }
}

export class ServiceBuilder<const Api extends AnyServiceApi> {
  public impl?: InferApi<Api>;

  constructor(public readonly api: Api) {}

  bind<const Impl extends InferApi<Api>>(impl: Impl): this {
    this.impl = { ...this.impl, ...impl };
    return this;
  }
}

export function initServer(): ServerBuilder {
  return new ServerBuilder();
}
