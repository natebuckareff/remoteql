import { parallelMerge } from 'streaming-iterables';
import type { AnyRouterApi } from './api.js';
import type { SerializedFrame, SerializedOp } from './frame.js';
import { type Expr, noramlizeTarget, type Target } from './operation.js';
import type { SerializedRootFrame } from './plan-builder.js';
import type { Handler, Stream } from './server.js';
import { RouterInstance, ServiceInstance } from './server.js';
import type { ServerResponse, StreamMessage } from './server-instance.js';
import { isThenable } from './util.js';

type ResolveResult = ValueResolveResult | HandlerResolveResult;

interface ValueResolveResult {
  kind: 'value';
  value: unknown;
}

interface HandlerResolveResult {
  kind: 'handler';
  routers: RouterInstance<any, any>[];
  service: ServiceInstance<any, any>;
  handler: Handler<any, any, any> | Stream<any, any, any, any>;
}

// TODO: consider type tagging this.ref values
function isAsyncGenerator(
  value: unknown,
): value is AsyncGenerator<unknown, unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any)[Symbol.asyncIterator] === 'function' &&
    'next' in value &&
    typeof value.next === 'function'
  );
}

export class Interpreter<Context> {
  private lastId?: number;

  private constructor(
    private context: Context,
    private refs: Map<number, unknown>,
  ) {}

  static async create<Context>(
    context: Context,
    router: RouterInstance<Context, any>,
  ): Promise<Interpreter<Context>> {
    const interpreter = new Interpreter(context, new Map());
    const index = interpreter.refs.size;
    interpreter.refs.set(index, router);
    return interpreter;
  }

  async *evaluate(
    frame: SerializedRootFrame,
  ): ServerResponse<unknown, unknown> {
    if (frame.params.length !== this.refs.size) {
      throw Error('invalid number of bindings');
    }

    await this.evaluateFrame(frame);

    const generators = frame.streams.map(id => {
      // TODO: safer ref handling
      const generator = this.refs.get(id);
      if (generator === undefined) {
        throw Error(`stream not found: ${id}`);
      }

      async function* transformed(): AsyncGenerator<
        StreamMessage<unknown, unknown>
      > {
        // TODO: error handling and evaluate semantics
        if (!isAsyncGenerator(generator)) {
          throw Error(`stream is not an AsyncGenerator: ${id}`);
        }

        try {
          while (true) {
            const result = await generator.next();
            if (result.done) {
              yield { type: 'return', id: id, value: result.value };
              break;
            }
            yield { type: 'next', id: id, value: result.value };
          }
        } catch (error) {
          yield { type: 'error', id: id, error };
        }
      }

      return transformed();
    });

    yield* parallelMerge(...generators);

    return frame.outputs.map(id => this.refs.get(id));
  }

  private async evaluateFrame(frame: SerializedFrame): Promise<void> {
    for (const [key, opOrFrame] of Object.entries(frame.ops)) {
      const id = Number(key);

      if (Array.isArray(opOrFrame)) {
        await this.evaluateOp(id, opOrFrame);
      } else {
        this.evaluateCallbackFrame(id, opOrFrame);
      }
    }
  }

  private async evaluateOp(id: number, op: SerializedOp): Promise<void> {
    switch (op[0]) {
      case 'get': {
        const [, target] = op;
        const result = this.resolveTarget(target);
        if (result.kind !== 'value') {
          throw Error('target is not a value');
        }
        const { value } = result;
        this.setRef(id, value);
        break;
      }

      case 'data': {
        const [, data] = op;
        this.setRef(id, data);
        break;
      }

      case 'apply': {
        const [, target, argIds] = op;
        const result = this.resolveTarget(target);
        if (result.kind === 'handler') {
          if (argIds.length > 1) {
            throw Error('invalid number of handler arguments');
          }
          const argId = argIds[0];
          const input = argId === undefined ? undefined : this.refs.get(argId);
          const { handler } = result;
          let output = handler({ cx: this.context, input });
          if (isThenable(output)) {
            output = await output;
          }
          this.setRef(id, output);
        } else {
          throw Error('target is not callable');
        }
        break;
      }

      case 'map': {
        const [, target, callbackId] = op;
        const callback = this.refs.get(callbackId);
        if (typeof callback !== 'function') {
          throw Error('map callback is not a function');
        }
        const result = this.resolveTarget(target);
        if (result.kind !== 'value') {
          throw Error('target is not a value');
        }
        const { value: mappable } = result;
        let output: unknown;

        if (isAsyncGenerator(mappable)) {
          const transformed = async function* () {
            while (true) {
              const result = await mappable.next();
              if (result.done) {
                return result.value;
              }
              yield await callback(result.value);
            }
          };
          output = transformed();
        } else if (Array.isArray(mappable)) {
          const promises = mappable.map(async (value, index) => {
            return callback(value, index, mappable);
          });
          output = await Promise.all(promises);
        } else {
          output = await callback(mappable);
        }
        this.setRef(id, output);
        break;
      }

      case 'expr': {
        const [, expr] = op;
        const decoded = this.decodeExpr(expr);
        this.setRef(id, decoded);
        break;
      }
    }
  }

  private evaluateCallbackFrame(id: number, frame: SerializedFrame): void {
    const callback = async (...args: unknown[]) => {
      if (args.length < frame.params.length) {
        throw Error('invalid number of callback arguments');
      }

      const state = this.clone();

      for (let i = 0; i < frame.params.length; i++) {
        const argIndex = frame.params[i]!;
        const argValue = args[i]!;
        state.setRef(argIndex, argValue);
      }

      await state.evaluateFrame(frame);

      if (state.lastId === undefined) {
        throw Error('no ops evaluated');
      }

      return state.refs.get(state.lastId);
    };

    this.setRef(id, callback);
  }

  private clone(): Interpreter<Context> {
    const refs = new Map(this.refs);
    return new Interpreter(this.context, refs);
  }

  private setRef(id: number, value: unknown): void {
    if (this.lastId !== undefined && id <= this.lastId) {
      throw Error('non-monotonic id');
    }
    this.lastId = id;
    this.refs.set(id, value);
  }

  private resolveTarget(target: Target): ResolveResult {
    const { id, path } = noramlizeTarget(target);

    let value = this.refs.get(id);

    for (let i = 0; i < path.length; i++) {
      if (value == null) {
        break;
      }

      if (value instanceof RouterInstance) {
        return this.resolveRouter(value, path.slice(i));
      }

      const p = path[i]!;

      value = (value as Record<string, unknown>)[p];
    }

    return { kind: 'value', value };
  }

  private resolveRouter(
    router: RouterInstance<any, AnyRouterApi>,
    path: string[],
  ): HandlerResolveResult {
    const originalPath = [...path];
    const routers: RouterInstance<any, any>[] = [router];
    let service: ServiceInstance<any, any> | undefined;

    while (true) {
      const p = path.shift();
      if (p === undefined) {
        break;
      }

      const route = router.impl?.[p];

      if (route === undefined) {
        throw Error(`route not found: "${[...path, p].join('.')}"`);
      }

      if (route instanceof RouterInstance) {
        router = route;
        routers.push(route);
        continue;
      }

      if (route instanceof ServiceInstance) {
        service = route;
        break;
      }
    }

    if (service === undefined) {
      throw Error(`service not found: "${originalPath.join('.')}"`);
    }

    if (service.impl === undefined) {
      throw Error(`service not implemented: "${originalPath.join('.')}"`);
    }

    if (path.length !== 1) {
      throw Error(`invalid route: "${originalPath.join('.')}"`);
    }

    const handlerName = path[0]!;
    const handler = service.impl?.[handlerName];

    if (handler === undefined) {
      throw Error(`handler not implemented: "${originalPath.join('.')}"`);
    }

    return {
      kind: 'handler',
      routers,
      service,
      handler,
    };
  }

  private decodeExpr(expr: Expr): unknown {
    if (Array.isArray(expr)) {
      if (typeof expr[0] === 'number') {
        const [index] = expr;
        return this.refs.get(index);
      } else if (expr[0] === 'date') {
        return new Date(expr[1]);
      } else if (expr[0] === 'bigint') {
        return BigInt(expr[1]);
      } else if (expr[0] === 'undefined') {
        return undefined;
      } else {
        const [array] = expr;
        return array.map(e => this.decodeExpr(e));
      }
    } else if (typeof expr === 'object') {
      if (expr === null) {
        return null;
      }
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(expr)) {
        result[key] = this.decodeExpr(value);
      }
      return result;
    } else {
      return expr;
    }
  }
}
