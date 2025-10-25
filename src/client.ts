import { BatchScheduler } from './batch.js';
import { Plan } from './plan.js';
import type { Capture } from './proxy.js';

export class Client {
  public batch: BatchScheduler<Capture, unknown>;

  constructor() {
    this.batch = new BatchScheduler<Capture, unknown>(caps => {
      const plan = new Plan(caps);
      const frame = plan.getFrame();
      const outputs = plan.getOutputs();
      throw Error('todo');
    });
  }
}
