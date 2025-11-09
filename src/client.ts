import type {
  AnyHandlerApi,
  AnyRouterApi,
  AnyStreamApi,
  InferRouterType,
} from './api.js';
import { BatchScheduler } from './batch.js';
import { createProxy, type OpId, unwrapOperation } from './operation.js';
import { PlanBuilder, type SerializedPlan } from './plan-builder.js';
import type { PlanTemplate, SerializedPlanTemplate } from './plan-template.js';
import { type Resolved, Rpc } from './rpc-type.js';
import type { ServerResponse } from './server-instance.js';
import { unwrap } from './util.js';

export interface ClientConfig<Routes extends AnyRouterApi> {
  router: Routes;
  transport: Transport;
}

export interface Transport {
  send(plan: SerializedPlan | SerializedPlanTemplate): ServerResponse;
}

export type TemplateFn<
  Args extends any[],
  Outputs extends Record<string, Rpc<any>>,
> = (...args: Args) => {
  [K in keyof Outputs]: TemplateResult<Resolved<Outputs[K]>>;
};

export type TemplateResult<T> = T extends AsyncGenerator<any, any, any>
  ? T
  : Promise<T>;

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

    // TODO: rename batch -> scheduler everywhere...current naming is wrong
    // because a batch scheduler is not a single batch
    this.batch = new BatchScheduler(async () => {
      const plan = builder.serialize();

      reset();

      return this.config.transport.send(plan);
    });

    reset();
  }

  define<
    Args extends any[],
    Params extends Record<string, any>,
    Outputs extends Record<string, Rpc<any>>,
  >(
    prepare: (...args: Args) => Params,
    callback: (api: Rpc<InferRouterType<Routes>>, params: Params) => Outputs,
  ): TemplateFn<Args, Outputs> {
    interface ResultOp {
      id: OpId;
      source: AnyHandlerApi | AnyStreamApi;
    }

    const buildTemplate = (params: string[]) => {
      const templateBuilder = new PlanBuilder(this.config.router);
      const templateScheduler = new BatchScheduler(async () => {
        throw Error('cannot await within a plan template');
      });
      const root = createProxy<Rpc<InferRouterType<Routes>>>(
        templateScheduler,
        templateBuilder,
        { type: 'router', id: 0 },
      );

      const proxied: Record<string, unknown> = {};
      for (const key of params) {
        proxied[key] = createProxy(templateScheduler, templateBuilder, {
          type: 'plan-param',
          id: key,
        });
      }

      const callbackResult = callback(root, proxied as Params);
      const ids: Record<string, ResultOp> = {};

      for (const [key, result] of Object.entries(callbackResult)) {
        const op = unwrap(unwrapOperation(result));
        if (op.type !== 'apply') {
          throw Error('expected apply operation as output');
        }

        ids[key] = { id: op.id, source: op.source };

        if (Symbol.asyncIterator in result) {
          Rpc.consume(result);
        } else {
          Rpc.resolve(result);
        }
      }

      const template = templateBuilder.createTemplate();

      return { ids, template };
    };

    let cachedTemplate:
      | { ids: Record<string, ResultOp>; template: PlanTemplate }
      | undefined;

    return (...args: Args) => {
      const params = prepare(...args);

      cachedTemplate ??= buildTemplate(Object.keys(params));

      const { ids, template } = cachedTemplate;
      const payload = template.serialize(params);

      const scheduler = new BatchScheduler(async () => {
        return this.config.transport.send(payload);
      }, true);

      type Result = Promise<any> | AsyncGenerator<any, any, any>;
      const results: Record<string, Result> = {};

      for (const [key, { id, source }] of Object.entries(ids)) {
        if (template.plan.outputs.includes(id)) {
          if (source.kind !== 'handler') {
            throw Error('expected handler output');
          }
          results[key] = scheduler.resolve(id, source.output);
        } else {
          if (source.kind !== 'stream') {
            throw Error('expected stream output');
          }
          results[key] = scheduler.consume(id, source.value, source.output);
        }
      }

      scheduler.flush();

      return results as any;
    };
  }

  get api(): Rpc<InferRouterType<Routes>> {
    return this.proxy;
  }
}
