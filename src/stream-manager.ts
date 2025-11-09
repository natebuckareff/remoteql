import type { AnyCodec, Json } from 'typekind';
import { Channel } from './channel.js';
import type { OpId } from './operation.js';
import type { StreamMessage } from './server-instance.js';

export class StreamManager<Yield, Return> {
  private nextSeq: number = 0;
  private batch?: StreamBatch<Yield, Return>;

  pop(): StreamBatch<Yield, Return> | undefined {
    const batch = this.batch;
    this.batch = undefined;
    return batch;
  }

  private getCurrentBatch(): StreamBatch<Yield, Return> {
    if (this.batch === undefined) {
      this.batch = new StreamBatch(this.nextSeq++, new Map());
    }
    return this.batch;
  }

  consume(
    id: OpId,
    yieldCodec: AnyCodec,
    returnCodec: AnyCodec,
  ): AsyncGenerator<Yield, Return> {
    const batch = this.getCurrentBatch();
    return batch.consume(id, yieldCodec, returnCodec);
  }
}

export class StreamBatch<Yield, Return> {
  constructor(
    public readonly seq: number,
    public readonly requests: Map<OpId, Channel<Json, Json>>,
  ) {}

  get empty(): boolean {
    return this.requests.size === 0;
  }

  private getChannel(id: OpId): Channel<Json, Json> {
    const channel = this.requests.get(id);

    if (channel === undefined) {
      throw Error(`channel does not exist: seq=${this.seq}, id=${id}`);
    }

    return channel;
  }

  push(msg: StreamMessage): Promise<void> {
    switch (msg.type) {
      case 'next':
        return this.resolveNext(msg.id, msg.value);

      case 'return':
        return this.resolveReturn(msg.id, msg.value);

      case 'error':
        return this.reject(msg.id, msg.error);
    }
  }

  private resolveNext(id: OpId, value: Json): Promise<void> {
    const channel = this.getChannel(id);
    return channel.push(value);
  }

  private resolveReturn(id: OpId, value: Json): Promise<void> {
    const channel = this.getChannel(id);
    return channel.pushAndClose(value);
  }

  private reject(id: OpId, error: unknown): Promise<void> {
    const channel = this.getChannel(id);
    return channel.abort(error);
  }

  consume(
    id: OpId,
    yieldCodec: AnyCodec,
    returnCodec: AnyCodec,
  ): AsyncGenerator<Yield, Return> {
    if (this.requests.has(id)) {
      throw Error(
        `consumer already exists in batch: seq=${this.seq}, id=${id}`,
      );
    }
    const channel = new Channel<Json, Json>();
    this.requests.set(id, channel);

    const input = channel.consume();

    async function* output(): AsyncGenerator<Yield, Return> {
      while (true) {
        const result = await input.next();
        if (result.done) {
          return returnCodec.deserialize(result.value);
        }
        yield yieldCodec.deserialize(result.value);
      }
    }

    return output();
  }
}
