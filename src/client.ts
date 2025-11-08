import type { AnyRouterApi, InferRouterType } from './api.js';
import { BatchScheduler } from './batch.js';
import { createProxy } from './operation.js';
import { PlanBuilder, type SerializedPlan } from './plan-builder.js';
import type { Rpc } from './rpc-type.js';
import type { ServerResponse } from './server-instance.js';

export interface ClientConfig<Routes extends AnyRouterApi> {
  router: Routes;
  transport: Transport;
}

export interface Transport {
  send(plan: SerializedPlan): ServerResponse<unknown, unknown>;
}

export class Client<Routes extends AnyRouterApi> {
  private batch: BatchScheduler;
  private proxy!: Rpc<InferRouterType<Routes>>; // initializd by reset()

  constructor(public readonly config: ClientConfig<Routes>) {
    let builder: PlanBuilder;

    const reset = (): void => {
      builder = new PlanBuilder(this.config.router);
      this.proxy = createProxy<Rpc<InferRouterType<Routes>>>(
        this.batch,
        builder,
        { type: 'router', id: 0 },
      );
    };

    this.batch = new BatchScheduler(async () => {
      const plan = builder.serialize();

      reset();

      return this.config.transport.send(plan);
    });

    reset();
  }

  get api(): Rpc<InferRouterType<Routes>> {
    return this.proxy;
  }
}
