export class Channel<Yield, Return> {
  public readonly Msg: { next: Yield } | { return: Return } = undefined!;

  private ts: TransformStream<this['Msg'], this['Msg']>;
  private writer: WritableStreamDefaultWriter<this['Msg']>;

  constructor() {
    this.ts = new TransformStream<this['Msg'], this['Msg']>(
      {},
      { highWaterMark: 64 },
    );
    this.writer = this.ts.writable.getWriter();
  }

  push(value: Yield): Promise<void> {
    return this.writer.ready.then(() => this.writer.write({ next: value }));
  }

  async pushAndClose(value: Return): Promise<void> {
    await this.writer.ready.then(() => this.writer.write({ return: value }));
    return this.writer.close();
  }

  abort(error: unknown): Promise<void> {
    return this.writer.abort(error);
  }

  async *consume(): AsyncGenerator<Yield, Return> {
    const reader = this.ts.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          throw Error('channel prematurely closed');
        }

        if ('next' in value) {
          yield value.next;
        } else {
          return value.return;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
