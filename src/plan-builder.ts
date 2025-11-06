import type { AnyCodec } from 'typekind';
import { TupleCodec } from 'typekind';
import type {
  AnyHandlerApi,
  AnyRouterApi,
  AnyServiceApi,
  AnyStreamApi,
} from './api.js';
import { RouterApi } from './api.js';

import { Frame, type SerializedFrame } from './frame.js';
import type {
  NormalizedTarget,
  Operation,
  OpType,
  Target,
} from './operation.js';

interface DataCacheEntry {
  op: Operation;
  codec: AnyCodec;
}

// TODO: better name; should probably just be called `Plan`
export interface SerializedRootFrame extends SerializedFrame {
  outputs: number[];
  streams: number[];
}

export class PlanBuilder {
  private nextId: number = 0;
  private dataCache: Map<unknown, DataCacheEntry[]> = new Map();
  private stack: Frame[] = [];
  private bindings: Map<number, AnyRouterApi> = new Map();
  private outputs: number[] = [];
  private streams: number[] = [];

  constructor() {
    this.stack.push(new Frame());
  }

  pushParam(router?: AnyRouterApi): OpType<'param'> {
    const id = this.getNextId();
    this.current().pushParam(id);
    if (router !== undefined) {
      this.bindings.set(id, router);
    }
    return { type: 'param', id };
  }

  getParamBinding(id: number): AnyRouterApi {
    const binding = this.bindings.get(id);
    if (binding === undefined) {
      throw Error(`param binding not bound`);
    }
    return binding;
  }

  getHandler(target: NormalizedTarget): AnyHandlerApi | AnyStreamApi {
    let router = this.getParamBinding(target.id);
    let service: AnyServiceApi | undefined;
    const path: string[] = [...target.path];

    while (true) {
      const p = path.shift();
      if (p === undefined) {
        break;
      }

      const route = router.routes[p];

      if (route === undefined) {
        throw Error(`route not found: "${[...path, p].join('.')}"`);
      }

      if (route instanceof RouterApi) {
        router = route;
        continue;
      }

      service = route;
      break;
    }

    if (path.length !== 1) {
      throw Error(`invalid route: "${target.path.join('.')}"`);
    }

    if (service === undefined) {
      throw Error(`service not found: "${target.path.join('.')}"`);
    }

    const handlerName = path[0]!;
    const handler = service.handlers[handlerName];

    if (handler === undefined) {
      throw Error(`handler not found: "${target.path.join('.')}"`);
    }

    return handler;
  }

  getParamCodec(handler: AnyHandlerApi | AnyStreamApi, index: number) {
    const inputCodec = handler.input;

    if (inputCodec instanceof TupleCodec) {
      const argCodec = (inputCodec as TupleCodec<AnyCodec[]>).codecs[index];
      if (argCodec === undefined) {
        throw Error('handler argument index out of bounds');
      }
      return argCodec;
    }

    if (index !== 0) {
      throw Error('handler argument index out of bounds');
    }

    return inputCodec;
  }

  private getNextId(): number {
    return this.nextId++;
  }

  nest(fn: () => void): number {
    const id = this.getNextId();
    const frame = new Frame();
    this.current().set(id, frame);
    this.stack.push(frame);
    fn();
    this.stack.pop();
    return id;
  }

  private current(): Frame {
    const last = this.stack.at(-1);
    if (last === undefined) {
      throw Error('stack is empty');
    }
    return last;
  }

  pushOp<T extends Operation>(op: T): T {
    if (op.type === 'param') {
      throw Error('must use pushParam to create param ops');
    }

    if (op.type === 'data') {
      throw Error('must use pushData to create data ops');
    }

    op.id = this.getNextId();

    // TODO: DEBUG only
    validateOp(op);

    this.current().set(op.id, op);
    return op;
  }

  pushData(codec: AnyCodec, input: unknown): Operation {
    let entries = this.dataCache.get(input);
    if (entries === undefined) {
      entries = [];
      this.dataCache.set(input, entries);
    } else {
      const entry = entries.find(e => e.codec.equals(codec));
      if (entry !== undefined) {
        return entry.op;
      }
    }

    const data = codec.serialize(input);
    const id = this.getNextId();
    const dataOp: Operation = { type: 'data', id, data };
    this.current().set(id, dataOp);
    entries.push({ op: dataOp, codec });

    return dataOp;
  }

  pushOutput(op: Operation): Operation {
    const resolvedOp = this.resolveOp(op);
    this.outputs.push(resolvedOp.id);
    return resolvedOp;
  }

  pushStream(op: Operation): Operation {
    const resolvedOp = this.resolveOp(op);
    this.streams.push(resolvedOp.id);
    return resolvedOp;
  }

  resolveOp(op: Operation): Operation {
    if (op.type === 'get' && op.id === -1) {
      return this.pushOp(op);
    }
    return op;
  }

  finish(): SerializedRootFrame {
    const frame = this.stack.pop();

    if (frame === undefined) {
      throw Error('stack is empty');
    }

    if (this.stack.length !== 0) {
      throw Error('stack is not settled');
    }

    return {
      ...frame.serialize(),
      outputs: this.outputs,
      streams: this.streams,
    };
  }
}

function validateOp(op: Operation): void {
  const check = (id: number) => {
    if (id === -1) {
      throw Error('unresolved op');
    }
  };

  const checkTarget = (target: Target) => {
    if (typeof target === 'number') {
      check(target);
    } else {
      check(target[0]);
    }
  };

  check(op.id);

  switch (op.type) {
    case 'get':
      checkTarget(op.target);
      break;

    case 'apply':
      op.args.forEach(check);
      break;

    case 'map':
      checkTarget(op.target);
      check(op.callback);
      break;
  }
}
