import type { AnyApi, AnyRouterApi, InferRouterType } from '../api.js';
import { HandlerApi, RouterApi, ServiceApi, StreamApi } from '../api.js';
import type { Rpc } from '../rpc-type.js';
import type { Op, OpId, OpTarget, PlanBuilder } from './plan-builder.js';

const nothing = () => {};
const proxyStateSymbol = Symbol('proxyState');

export function isRpcProxy(value: unknown): value is Rpc<unknown> {
  return isOpProxy(value);
}

export function isOpProxy(value: unknown): value is OpProxy {
  return typeof value === 'function' && proxyStateSymbol in value;
}

export function unwrapOpProxy(value: Rpc<unknown>): ProxyState;
export function unwrapOpProxy(value: OpProxy): ProxyState;
export function unwrapOpProxy(value: unknown): ProxyState | undefined;
export function unwrapOpProxy(value: unknown): ProxyState | undefined {
  if (isOpProxy(value)) {
    return value[proxyStateSymbol];
  }
}

export interface OpProxy {
  [proxyStateSymbol]: ProxyState;
}

export class ProxyState {
  // private cachedPromise?: Promise<unknown>; // TODO
  // private cachedGenerator?: unknown; // TODO

  private constructor(
    public sched: {} | undefined, // TODO
    public builder: PlanBuilder,
    public api: AnyApi,
    public op: Op,
  ) {}

  static createProxy<Router extends AnyRouterApi>(
    sched: {} | undefined, // TODO
    builder: PlanBuilder,
    router: Router,
  ): Rpc<InferRouterType<Router>> {
    const root: Op = { kind: 'root', id: 0 };
    const state = new ProxyState(sched, builder, router, root);
    return createProxy<InferRouterType<Router>>(state);
  }

  createProxy<T extends object>(op: Op): Rpc<T>;
  createProxy<T extends object>(api: AnyApi, op: Op): Rpc<T>;
  createProxy<T extends object>(opOrApi: Op | AnyApi, opArg?: Op): Rpc<T> {
    const api = opArg === undefined ? this.api : (opOrApi as AnyApi);
    const op = opArg === undefined ? (opOrApi as Op) : opArg;
    const clone = new ProxyState(this.sched, this.builder, api, op);
    return createProxy<T>(clone);
  }
}

function createProxy<T extends object>(state: ProxyState): Rpc<T> {
  return new Proxy(nothing as Rpc<T>, {
    has(_target, p) {
      return trapHas(p);
    },
    get(_target, p) {
      return trapGet(state, p);
    },
    apply(_target, _thisArg, argArray) {
      return trapApply(state, argArray);
    },
  });
}

function trapHas(p: string | symbol): boolean {
  return p === proxyStateSymbol;
}

function trapGet(state: ProxyState, p: string | symbol): unknown {
  if (p === proxyStateSymbol) {
    return state;
  }

  if (p === 'then') {
    if (!state.sched) {
      throw Error('no batch scheduler');
    }

    if (state.op.id === -1) {
      state.op = state.builder.addOp(state.op);
    }

    // cachedPromise ??= state.sched?.schedulePromise(state.op.id); return
    // cachedPromise.then.bind(cachedPromise);
  }

  // TODO: handle generators

  if (typeof p !== 'string') {
    throw Error('invalid property');
  }

  const target: OpTarget =
    state.op.kind === 'get' && state.op.id === -1
      ? [...state.op.target, p]
      : [state.op.id, p];

  let api: AnyApi;

  if (state.api instanceof RouterApi) {
    const route = state.api.routes[p];
    if (route === undefined) {
      throw Error(`route not found`);
    }
    api = route;
  } else if (state.api instanceof ServiceApi) {
    const method = state.api.handlers[p];
    if (method === undefined) {
      throw Error(`method not found`);
    }
    api = method;
  } else {
    throw Error(`cannot get property of ${state.api.constructor.name}`);
  }

  return state.createProxy(api, {
    kind: 'get',
    id: -1,
    target,
  });
}

function trapApply(state: ProxyState, argArray: unknown[]): unknown {
  const args: OpId[] = [];

  // TODO: handle .map

  if (!(state.api instanceof HandlerApi || state.api instanceof StreamApi)) {
    throw Error('apply target is not a service method');
  }

  for (let i = 0; i < argArray.length; i++) {
    const arg = argArray[i];
    const codec = state.api.getParamCodec(i);

    if (isOpProxy(arg)) {
      args.push(arg[proxyStateSymbol].op.id);
    } else {
      const argOp = state.builder.addOp({
        kind: 'data',
        id: -1,
        data: codec.serialize(arg), // TODO: ref context
      });
      args.push(argOp.id);
    }
  }

  const target: OpTarget =
    state.op.kind === 'get' && state.op.id === -1
      ? state.op.target
      : [state.op.id];

  const applyOp = state.builder.addOp({
    kind: 'apply',
    id: -1,
    target,
    args,
  });

  return state.createProxy(applyOp);
}
