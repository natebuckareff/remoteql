import { Channel } from './channel.js';
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

  consume(id: number): AsyncGenerator<Yield, Return> {
    const batch = this.getCurrentBatch();
    return batch.consume(id);
  }
}

export class StreamBatch<Yield, Return> {
  constructor(
    public readonly seq: number,
    public readonly requests: Map<number, Channel<Yield, Return>>,
  ) {}

  get empty(): boolean {
    return this.requests.size === 0;
  }

  private getChannel(id: number): Channel<Yield, Return> {
    const channel = this.requests.get(id);

    if (channel === undefined) {
      throw Error(`channel does not exist: seq=${this.seq}, id=${id}`);
    }

    return channel;
  }

  push(msg: StreamMessage<Yield, Return>): Promise<void> {
    switch (msg.type) {
      case 'next':
        return this.resolveNext(msg.id, msg.value);

      case 'return':
        return this.resolveReturn(msg.id, msg.value);

      case 'error':
        return this.reject(msg.id, msg.error);
    }
  }

  private resolveNext(id: number, value: Yield): Promise<void> {
    const channel = this.getChannel(id);
    return channel.push(value);
  }

  private resolveReturn(id: number, value: Return): Promise<void> {
    const channel = this.getChannel(id);
    return channel.pushAndClose(value);
  }

  private reject(id: number, error: unknown): Promise<void> {
    const channel = this.getChannel(id);
    return channel.abort(error);
  }

  consume(id: number): AsyncGenerator<Yield, Return> {
    if (this.requests.has(id)) {
      throw Error(
        `consumer already exists in batch: seq=${this.seq}, id=${id}`,
      );
    }
    const channel = new Channel<Yield, Return>();
    this.requests.set(id, channel);
    return channel.consume();
  }
}
