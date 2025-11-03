import type { AnyRouterApi } from './api.js';
import type { SerializedRootFrame } from './plan-builder.js';
import type { RouterInstance } from './server.js';

export interface ServerConfig<Context, Routes extends AnyRouterApi> {
  router: RouterInstance<Context, Routes>;
}

export class ServerInstance<Context, Routes extends AnyRouterApi> {
  constructor(public readonly config: ServerConfig<Context, Routes>) {}

  run(request: SerializedRootFrame): Promise<unknown[]> {
    // const interpreter = Interpreter.create(this.config.router);
    // return interpreter.evaluate(request);

    throw Error('todo');
  }
}
