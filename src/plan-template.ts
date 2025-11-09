import type { AnyCodec, Json } from 'typekind';
import type { SerializedPlan } from './plan-builder.js';

// TODO: consider folding into SerializedPlan with optional param
export interface SerializedPlanTemplate extends SerializedPlan {
  params: Record<string, unknown>;
}

export class PlanTemplate {
  constructor(
    public readonly plan: SerializedPlan,
    private paramCodecs: Map<string, AnyCodec>,
  ) {}

  serialize(params: Record<string, unknown>): SerializedPlanTemplate {
    const serialized: Record<string, Json> = {};

    for (const [key, value] of Object.entries(params)) {
      const codec = this.paramCodecs.get(key);
      if (codec === undefined) {
        throw Error(`param codec not found: "${key}"`);
      }
      serialized[key] = codec.serialize(value);
    }

    return {
      params: serialized,
      ...this.plan,
    };
  }
}
