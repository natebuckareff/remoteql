import type { Block, Frame, Operation, Plan } from './plan.js';
import { RpcImpl } from './rpc-type.js';
import { deserialize } from './serialize.js';
import { get, isThenable } from './util.js';

export class Interpreter {
  private constructor(private refs: Map<number, unknown>) {}

  static create(): Interpreter {
    return new Interpreter(new Map());
  }

  bind<T extends RpcImpl>(impl: T): void {
    const index = this.refs.size;
    this.refs.set(index, impl);
  }

  async evaluate(plan: Plan): Promise<unknown[]> {
    await this._interpretFrame(plan.getFrame());
    const outputs = plan.getOutputs();
    const promises = outputs.map(index =>
      Promise.resolve(this.refs.get(index)),
    );
    return Promise.all(promises);
  }

  clone(): Interpreter {
    const refs = new Map(this.refs);
    return new Interpreter(refs);
  }

  private _setRef(index: number, value: unknown): void {
    if (this.refs.has(index)) {
      throw Error(`ref already defined: ${index}`);
    }
    this.refs.set(index, value);
  }

  private async _resolvePath(path: (number | string)[]): Promise<unknown> {
    let value: unknown | undefined;

    for (let i = 0; i < path.length; i++) {
      const part = get(path, i);

      if (typeof part === 'number') {
        value = this.refs.get(part);
        if (value === undefined) {
          throw Error(`ref not defined: ${part}`);
        }
      } else {
        if (value == null) {
          break;
        }

        if (value instanceof RpcImpl) {
          const instance = value;
          // biome-ignore lint/suspicious/noExplicitAny: extract method for binding
          const method = (value as any)[part];
          if (typeof method !== 'function') {
            throw Error(`method not found: ${part}`);
          }
          value = method.bind(instance);
        } else {
          value = (value as Record<string, unknown>)[part];
        }
      }

      if (isThenable(value)) {
        value = await value;
      }
    }
    return value;
  }

  private async _interpretFrame(frame: Frame) {
    for (const [key, value] of Object.entries(frame)) {
      const index = Number(key);

      if (Array.isArray(value)) {
        await this._interpretOperation(index, value);
      } else {
        this._interpretBlock(index, value);
      }
    }
  }

  private async _interpretOperation(index: number, op: Operation) {
    switch (op[0]) {
      case 'let': {
        const [, value] = op;
        const deserialized = deserialize(value, index => this.refs.get(index));
        this._setRef(index, deserialized);
        break;
      }

      case 'get': {
        const [, ...path] = op;
        const value = await this._resolvePath(path);
        this._setRef(index, value);
        break;
      }

      case 'call': {
        const [, path, ...argIndices] = op;
        const f = await this._resolvePath(path);
        if (typeof f !== 'function') {
          throw Error(`value is not callable`);
        }
        const args = argIndices.map(index => this.refs.get(index));
        if (args.length !== f.length) {
          throw Error(`invalid number of arguments`);
        }
        let result = f(...args);
        if (isThenable(result)) {
          result = await result;
        }
        this._setRef(index, result);
        break;
      }

      case 'map': {
        const [, path, blockIndex] = op;

        const callback = this.refs.get(blockIndex);
        if (typeof callback !== 'function') {
          throw Error('map callback is not callable');
        }

        const target = await this._resolvePath(path);

        if (Array.isArray(target)) {
          const results = await Promise.all(
            target.map((value, index) => callback(value, index, target)),
          );
          this._setRef(index, results);
        } else {
          const result = await callback(target);
          this._setRef(index, result);
        }
        break;
      }

      default:
        throw Error('invalid operation');
    }
  }

  _interpretBlock(index: number, block: Block) {
    const callback = async (...args: unknown[]) => {
      if (args.length < block.params.length) {
        throw Error(`invalid number of callback arguments`);
      }

      const state = this.clone();

      for (let i = 0; i < block.params.length; ++i) {
        const argIndex = get(block.params, i);
        const argValue = get(args, i);
        state._setRef(argIndex, argValue);
      }

      await state._interpretFrame(block.frame);

      if (block.outputs.length === 0) {
        return;
      } else if (block.outputs.length === 1) {
        const outputIndex = get(block.outputs, 0);
        return state.refs.get(outputIndex);
      } else {
        throw Error('invalid number of outputs');
      }
    };

    this._setRef(index, callback);
  }
}
