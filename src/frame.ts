import type { Json } from 'typekind';
import type { Expr, Operation, OpId, Target } from './operation.js';

export interface SerializedFrame {
  params: number[];
  ops: SerializedOpMap;
}

export interface SerializedOpMap {
  [ref: string]: SerializedOp | SerializedFrame;
}

export type SerializedOp =
  | ['get', Target]
  | ['data', Json]
  | ['apply', Target, OpId[]]
  | ['map', Target, number]
  | ['expr', Expr];

export class Frame {
  private params: number[] = [];
  private ops: Map<number, Operation | Frame> = new Map();

  pushParam(id: number): void {
    if (this.ops.size > 0) {
      throw Error('cannot push params to non-empty frame');
    }
    this.params.push(id);
  }

  set(id: number, op: Operation | Frame): void {
    this.ops.set(id, op);
  }

  serialize(): SerializedFrame {
    const frameJson: SerializedFrame = {
      params: this.params,
      ops: {},
    };

    for (const [id, opOrFrame] of this.ops) {
      if (opOrFrame instanceof Frame) {
        frameJson.ops[id.toString()] = opOrFrame.serialize();
      } else {
        frameJson.ops[id.toString()] = this.serializeOp(opOrFrame);
      }
    }

    return frameJson;
  }

  serializeOp(op: Operation): SerializedOp {
    switch (op.type) {
      case 'router':
        throw Error('cannot serialize router');

      case 'plan-param':
        throw Error('todo');

      case 'param':
        throw Error('cannot serialize param');

      case 'get':
        return ['get', op.target];

      case 'data':
        return ['data', op.data];

      case 'apply':
        return ['apply', op.target, op.args];

      case 'map':
        return ['map', op.target, op.callback];

      case 'expr':
        return ['expr', op.expr];
    }
  }
}
