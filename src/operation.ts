import { createRef, type Json } from 'typekind';
import type { PlanBuilder } from './plan-builder.js';

const operationSymbol = Symbol('operation');

export type Operation =
  | { type: 'param'; id: number }
  | { type: 'get'; id: number; target: Target }
  | { type: 'data'; id: number; data: Json }
  | { type: 'apply'; id: number; target: Target; args: number[] }
  | { type: 'map'; id: number; target: Target; callback: number }
  | { type: 'expr'; id: number; expr: Expr };

export type Expr =
  | null
  | boolean
  | number
  | string
  | [number]
  | ['date', number]
  | ['bigint', string]
  | ['undefined']
  | [Expr[]]
  | { [property: string]: Expr };

export type OpType<T extends Operation['type']> = Extract<
  Operation,
  { type: T }
>;

export type Target = number | [number, ...string[]];

export interface NormalizedTarget {
  id: number;
  path: string[];
}

export interface OperationProxy {
  [operationSymbol]: Operation;
}

export function isOperationProxy(value: unknown): value is OperationProxy {
  return (
    typeof value === 'function' && value !== null && operationSymbol in value
  );
}

export function noramlizeTarget(target: Target): NormalizedTarget {
  if (typeof target === 'number') {
    return { id: target, path: [] };
  }
  const [id, ...path] = target;
  return { id, path };
}

export function unwrapOperation(value: OperationProxy): Operation;
export function unwrapOperation(value: unknown): Operation | undefined;
export function unwrapOperation(value: unknown): Operation | undefined {
  if (isOperationProxy(value)) {
    return value[operationSymbol];
  }
  return;
}

export function createProxy<T extends object>(
  builder: PlanBuilder,
  op: Operation,
): T {
  return createRef(op.id, {
    handler: {
      has(_target, p) {
        return p === operationSymbol;
      },

      get(_target, p) {
        if (p === operationSymbol) {
          return op;
        }

        if (typeof p !== 'string') {
          throw Error('invalid property');
        }

        if (op.type === 'get') {
          const { id, path } = noramlizeTarget(op.target);
          return createProxy(builder, {
            type: 'get',
            id: -1,
            target: [id, ...path, p],
          });
        }

        return createProxy(builder, {
          type: 'get',
          id: -1,
          target: [op.id, p],
        });
      },

      apply(_target, _thisArg, argArray) {
        const target: NormalizedTarget =
          op.type === 'get'
            ? noramlizeTarget(op.target)
            : { id: op.id, path: [] };

        if (target.path.at(-1) === 'map') {
          if (argArray.length === 1 && typeof argArray[0] === 'function') {
            const callbackId = builder.nest(() => {
              const fn = argArray[0];
              const param = builder.pushParam();
              const arg = createProxy(builder, param);
              builder.pushOp({
                type: 'expr',
                id: -1,
                expr: encodeExpr(builder, fn(arg)),
              });
            });

            const mapOp = builder.pushOp({
              type: 'map',
              id: -1,
              target: [target.id, ...target.path.slice(0, -1)],
              callback: callbackId,
            });

            return createProxy(builder, mapOp);
          }
        }

        const argIds: number[] = [];

        for (let i = 0; i < argArray.length; i++) {
          const arg = argArray[i];
          if (isOperationProxy(arg)) {
            const argOp = builder.resolveOp(arg[operationSymbol]);
            argIds.push(argOp.id);
          } else {
            const codec = builder.getParamCodec(target, i);
            if (codec === undefined) {
              throw Error('handler argument index out of bounds');
            }
            const dataOp = builder.pushData(codec, arg);
            argIds.push(dataOp.id);
          }
        }

        const applyOp = builder.pushOp({
          type: 'apply',
          id: -1,
          target: [target.id, ...target.path],
          args: argIds,
        });

        return createProxy(builder, applyOp);
      },
    },
    serialize: proxy => {
      if (isOperationProxy(proxy)) {
        const op = builder.resolveOp(proxy[operationSymbol]);
        return op.id;
      }
    },
  });
}

function encodeExpr(builder: PlanBuilder, value: unknown): Expr {
  if (isOperationProxy(value)) {
    const op = builder.resolveOp(value[operationSymbol]);
    return [op.id];
  }

  if (typeof value === 'object') {
    if (value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return [value.map(x => encodeExpr(builder, x))];
    }

    if (value instanceof Date) {
      return ['date', value.getTime()];
    }

    if (value.constructor.name !== 'Object') {
      throw Error('cannot encode non-plain objects');
    }

    const obj: Record<string, Expr> = {};
    for (const [key, field] of Object.entries(value)) {
      obj[key] = encodeExpr(builder, field);
    }
    return obj;
  }

  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return value;

    case 'bigint':
      return ['bigint', value.toString()];

    case 'undefined':
      return ['undefined'];

    default:
      throw Error(`cannot encode expression of type "${typeof value}"`);
  }
}
