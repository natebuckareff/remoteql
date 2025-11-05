import { Channel } from './channel.js';

export class StreamManager<Yield, Return> {
  private nextPhaseSeq: number = 0;
  private phase?: Phase<Yield, Return>;

  pop(): Phase<Yield, Return> | undefined {
    const phase = this.phase;
    this.phase = undefined;
    return phase;
  }

  private getCurrentPhase(): Phase<Yield, Return> {
    if (this.phase === undefined) {
      this.phase = new Phase(this.nextPhaseSeq++, new Map());
    }
    return this.phase;
  }

  consume(id: number): AsyncGenerator<Yield, Return> {
    const phase = this.getCurrentPhase();
    return phase.consume(id);
  }
}

export class Phase<Yield, Return> {
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

  resolveNext(id: number, value: Yield): Promise<void> {
    const channel = this.getChannel(id);
    return channel.push(value);
  }

  resolveReturn(id: number, value: Return): Promise<void> {
    const channel = this.getChannel(id);
    return channel.pushAndClose(value);
  }

  reject(id: number, error: unknown): Promise<void> {
    const channel = this.getChannel(id);
    return channel.abort(error);
  }

  consume(id: number): AsyncGenerator<Yield, Return> {
    if (this.requests.has(id)) {
      throw Error(
        `consumer already exists in phase: seq=${this.seq}, id=${id}`,
      );
    }
    const channel = new Channel<Yield, Return>();
    this.requests.set(id, channel);
    return channel.consume();
  }
}
