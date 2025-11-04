import type { AnyRouterApi, InferRouterType } from './api.js';
import { BatchScheduler } from './batch.js';
import { createProxy } from './operation.js';
import { PlanBuilder, type SerializedRootFrame } from './plan-builder.js';
import type { Rpc } from './rpc-type.js';

export interface ClientConfig<Routes extends AnyRouterApi> {
  router: Routes;
  transport: Transport;
}

export interface Transport {
  send(plan: SerializedRootFrame): Promise<unknown[]>;
}

export class Client<Routes extends AnyRouterApi> {
  private batch: BatchScheduler<number, unknown>;
  private proxy!: Rpc<InferRouterType<Routes>>; // initializd by reset()

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

    this.batch = new BatchScheduler(async inputs => {
      const plan = builder.finish();

      reset();

      const results = await this.config.transport.send(plan);

      const orderedResults = inputs.map(id => {
        const index = plan.outputs.indexOf(id);
        return results[index];
      });

      return orderedResults;
    });

    reset();
  }

  get api(): Rpc<InferRouterType<Routes>> {
    return this.proxy;
  }
}
