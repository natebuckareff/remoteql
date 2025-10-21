import { Capture, getCapture, ValueCapture } from "./proxy";
import { Rpc } from "./rpc-type";
import { serialize } from "./serialize";

export type Frame = Record<number, Operation | Block>;

export type Operation =
  | ["let", unknown]
  | ["get", ...(number | string)[]]
  | ["call", (number | string)[], ...number[]]
  | ["map", (number | string)[], number];

export interface Block {
  params: number[];
  frame: Frame;
  outputs: number[];
}

class Value {
  constructor(private value: unknown) {}

  get(): unknown {
    return this.value;
  }
}

export class Ref {
  constructor(private index: number) {}

  get(): number {
    return this.index;
  }
}

export class Plan {
  private frame: Frame = {};
  private ids: Map<unknown, number> = new Map();
  private nextId = 0;
  private outputs: number[] = [];

  constructor(values: Rpc<any>[]) {
    this._walk(values);
  }

  getFrame(): Frame {
    return this.frame;
  }

  private _getNextId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private _getIdOrNext(cap: Capture): number {
    let id = this.ids.get(cap);
    if (id === undefined) {
      id = this._getNextId();
      this.ids.set(cap, id);
    }
    return id;
  }

  private _getIdOf(cap: Capture): number {
    const id = this.ids.get(cap);
    if (id === undefined) {
      throw Error("capture id not found");
    }
    return id;
  }

  private _walk(values: Rpc<any>[]): void {
    for (const value of values) {
      const cap = getCapture(value);
      if (cap === undefined) {
        throw Error("invalid rpc promise");
      }
      this._walkCapture(cap, this.frame);
      const outputId = this._getIdOf(cap);
      this.outputs.push(outputId);
    }
  }

  private _walkCapture(cap: Capture, frame: Frame): number | Value {
    const rec = (cap: Capture, frame: Frame): number => {
      const value = this._walkCapture(cap, frame);

      if (value instanceof Value) {
        const id = this._getNextId();
        const ser = serialize(value.get());
        frame[id] = ["let", ser];
        return id;
      } else {
        return value;
      }
    };

    switch (cap.kind) {
      case "var":
        return this._getIdOrNext(cap);

      case "get": {
        const [targetCap, path] = compressGetPath(cap);
        const targetId = rec(targetCap, frame);
        const id = this._getIdOrNext(cap);
        const fullPath = [targetId, ...path];
        const op: Operation = ["get", ...fullPath];
        frame[id] = op;
        return id;
      }

      case "apply": {
        const [target, path] = compressGetPath(cap.parent);
        const parentId = rec(target, frame);
        const argIds: number[] = [];
        for (const arg of cap.args) {
          const argId = rec(arg, frame);
          argIds.push(argId);
        }
        const id = this._getIdOrNext(cap);
        const fullPath = [parentId, ...path];
        const op: Operation = ["call", fullPath, ...argIds];
        frame[id] = op;
        return id;
      }

      case "map": {
        const block: Block = {
          params: [],
          frame: {},
          outputs: [],
        };

        const [target, path] = compressGetPath(cap.parent);
        const parentId = rec(target, frame);
        const fullPath = [parentId, ...path];

        const blockId = this._getNextId();
        for (const arg of cap.args) {
          const argId = rec(arg, block.frame);
          block.params.push(argId);
        }

        const outputId = rec(cap.output, block.frame);
        block.outputs.push(outputId);
        frame[blockId] = block;

        const mapId = this._getIdOrNext(cap);
        const callOp: Operation = ["call", fullPath, blockId];
        frame[mapId] = callOp;
        return mapId;
      }

      case "value":
        return this._walkValue(cap, frame);
    }
  }

  private _walkValue(cap: ValueCapture, frame: Frame): Value {
    const unwrap = (value: number | Value): unknown => {
      if (value instanceof Value) {
        return value.get();
      } else {
        return new Ref(value);
      }
    };

    switch (cap.type) {
      case "primitive":
        return new Value(cap.value);

      case "array": {
        const output: any[] = [];
        for (const element of cap.value) {
          output.push(unwrap(this._walkCapture(element, frame)));
        }
        return new Value(output);
      }

      case "object": {
        const output: Record<string, any> = {};
        for (const [prop, field] of Object.entries(cap.value)) {
          output[prop] = unwrap(this._walkCapture(field, frame));
        }
        return new Value(output);
      }

      case "function":
        throw Error("invalid rpc value");
    }
  }
}

function compressGetPath(cap: Capture): [Capture, (number | string)[]] {
  const path: (number | string)[] = [];
  while (true) {
    if (cap.kind === "get") {
      path.unshift(cap.property);
      cap = cap.parent;
    } else {
      return [cap, path];
    }
  }
}
