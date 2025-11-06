import type { AnyRouterApi, InferRouterType } from './api.js';
import { BatchScheduler } from './batch.js';
import { createProxy } from './operation.js';
import { PlanBuilder, type SerializedRootFrame } from './plan-builder.js';
import type { Rpc } from './rpc-type.js';
import type { ServerResponse } from './server-instance.js';

export interface ClientConfig<Routes extends AnyRouterApi> {
  router: Routes;
  transport: Transport;
}

export interface Transport {
  send(plan: SerializedRootFrame): ServerResponse<unknown, unknown>;
}

export class Client<Routes extends AnyRouterApi> {
  private batch: BatchScheduler;
  private proxy!: Rpc<InferRouterType<Routes>>; // initializd by reset()

  // TODO: how to handle this case:
  // ```
  // const x = client.api.foo()
  // const stream = client.api.stream()
  // for await (const v of stream) { .. } // <-- batch finished here!
  // console.log(await x) // <-- this will fail!
  // ```

  constructor(public readonly config: ClientConfig<Routes>) {
    let builder = new PlanBuilder();

    const reset = (): void => {
      builder = new PlanBuilder();
      const root = builder.pushParam(this.config.router);
      this.proxy = createProxy<Rpc<InferRouterType<Routes>>>(
        this.batch,
        builder,
        root,
      );
    };

    this.batch = new BatchScheduler(async () => {
      const plan = builder.finish();

      reset();

      return this.config.transport.send(plan);
    });

    reset();
  }

  get api(): Rpc<InferRouterType<Routes>> {
    return this.proxy;
  }
}
