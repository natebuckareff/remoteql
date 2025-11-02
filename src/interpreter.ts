import type { AnyServiceApi } from './api.js';
import type { SerializedFrame, SerializedOp } from './frame.js';
import { type Expr, noramlizeTarget, type Target } from './operation.js';
import type { SerializedRootFrame } from './plan-builder.js';
import { ServiceBuilder } from './server.js';
import { isThenable } from './util.js';

export class InterpreterV2 {
  private lastId?: number;

  private constructor(private refs: Map<number, unknown>) {}

  static create(): InterpreterV2 {
    return new InterpreterV2(new Map());
  }

  bind<T extends ServiceBuilder<AnyServiceApi>>(impl: T): void {
    const index = this.refs.size;
    this.refs.set(index, impl);
  }

  async evaluate(frame: SerializedRootFrame): Promise<unknown[]> {
    if (frame.params.length !== this.refs.size) {
      throw Error('invalid number of bindings');
    }

    await this.evaluateFrame(frame);

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
        const value = this.resolveTarget(target);
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

        const callable = this.resolveTarget(target);
        const args = argIds.map(id => this.refs.get(id));
        if (typeof callable !== 'function') {
          throw Error('target is not callable');
        }
        const input = args.length === 1 ? args[0] : args;
        let result = callable({ input });
        if (isThenable(result)) {
          result = await result;
        }
        this.setRef(id, result);
        break;
      }

      case 'map': {
        const [, target, callbackId] = op;
        const callback = this.refs.get(callbackId);
        if (typeof callback !== 'function') {
          throw Error('map callback is not a function');
        }
        const mappable = this.resolveTarget(target);
        let result: unknown;
        if (Array.isArray(mappable)) {
          const promises = mappable.map(async (value, index) => {
            return callback(value, index, mappable);
          });
          result = await Promise.all(promises);
        } else {
          result = await callback(mappable);
        }
        this.setRef(id, result);
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

  private clone(): InterpreterV2 {
    const refs = new Map(this.refs);
    return new InterpreterV2(refs);
  }

  private setRef(id: number, value: unknown): void {
    if (this.lastId !== undefined && id <= this.lastId) {
      throw Error('non-monotonic id');
    }
    this.lastId = id;
    this.refs.set(id, value);
  }

  private resolveTarget(target: Target): unknown {
    const { id, path } = noramlizeTarget(target);

    let value = this.refs.get(id);

    for (const p of path) {
      if (value == null) {
        break;
      }

      let child: unknown;

      if (value instanceof ServiceBuilder) {
        child = value.impl?.[p];
      } else {
        child = (value as Record<string, unknown>)[p];
      }

      if (typeof child === 'function') {
        if (value instanceof ServiceBuilder) {
          child = child.bind(value);
        }
      }

      value = child;
    }

    return value;
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
        return array.map(this.decodeExpr);
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
