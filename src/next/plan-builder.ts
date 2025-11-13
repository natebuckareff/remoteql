import type { Json } from 'typekind';

export type Op =
  | { kind: 'root'; id: 0 }
  | { kind: 'get'; id: number; target: OpTarget }
  | { kind: 'data'; id: number; data: Json }
  | { kind: 'apply'; id: number; target: OpTarget; args: OpId[] };

export type OpId = number | string;
export type OpTarget = [OpId, ...string[]];

export class PlanBuilder {
  private ops: Map<OpId, Op> = new Map();

  constructor() {
    this.ops.set(0, { kind: 'root', id: 0 });
  }

  get root(): Extract<Op, { kind: 'root' }> {
    return this.ops.get(0) as Extract<Op, { kind: 'root' }>;
  }

  addOp(op: Op): Op {
    op.id = this.ops.size;
    this.ops.set(op.id, op);
    return op;
  }
}
