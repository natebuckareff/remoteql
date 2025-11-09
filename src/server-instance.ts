import type { AnyRouterApi, AnyServiceApi, InferServiceType } from './api.js';
import { Interpreter } from './interpreter.js';
import type { OpId } from './operation.js';
import type { SerializedPlan } from './plan-builder.js';
import {
  type ContextParams,
  type RouterInstance,
  ServiceInstance,
} from './server.js';

export type ContextFn<Context> = (params: ContextParams) => Promise<Context>;

export interface ServerConfig<Context, Routes extends AnyRouterApi> {
  router: RouterInstance<Context, Routes>;
  context?: ContextFn<Context>;
}

export type StreamMessage<Yield, Return> =
  | { type: 'next'; id: OpId; value: Yield }
  | { type: 'return'; id: OpId; value: Return }
  | { type: 'error'; id: OpId; error: unknown };

export type ServerResponse<Yield, Return> = AsyncGenerator<
  StreamMessage<Yield, Return>,
  unknown[]
>;

export class ServerInstance<Context, Routes extends AnyRouterApi> {
  constructor(public readonly config: ServerConfig<Context, Routes>) {}

  private findServiceInstance(
    router: RouterInstance<Context, AnyRouterApi>,
    api: AnyServiceApi,
  ): ServiceInstance<Context, AnyServiceApi> | undefined {
    for (const [, route] of router.entries()) {
      if (route instanceof ServiceInstance) {
        if (route.api === api) {
          return route;
        }
      } else {
        return this.findServiceInstance(route, api);
      }
    }
  }

  private createServiceClient(cx: Context, service: ServiceInstance<any, any>) {
    if (service.impl === undefined) {
      throw Error('service not implemented');
    }

    const client: Record<string, (input: unknown) => Promise<unknown>> = {};

    for (const [name, handler] of Object.entries(service.impl)) {
      client[name] = async (input: unknown) => {
        if (handler === undefined) {
          throw Error(`handler not implemented: "${name}"`);
        }
        return handler({ cx, input });
      };
    }

    return client;
  }

  async createContext(): Promise<Context> {
    if (this.config.context === undefined) {
      return undefined!;
    }

    let cx: Context | undefined;

    const inject = <T extends AnyServiceApi>(api: T): InferServiceType<T> => {
      if (cx === undefined) {
        throw Error('context not initialized');
      }

      const service = this.findServiceInstance(this.config.router, api);
      if (service === undefined) {
        throw Error(`service not found`);
      }

      return this.createServiceClient(cx, service) as InferServiceType<T>;
    };

    cx = await this.config.context({ inject });

    return cx;
  }

  async *evaluate(frame: SerializedPlan): ServerResponse<unknown, unknown> {
    const context = await this.createContext();
    const interpreter = await Interpreter.create(context, this.config.router);

    const generator = interpreter.evaluate(frame);

    // TODO: keep using this general pattern, is it ok or should abstract it?
    while (true) {
      const result = await generator.next();
      if (result.done) {
        return result.value;
      }
      yield result.value;
    }
  }
}
