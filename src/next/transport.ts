import type { OpId } from './plan-builder.js';

// TODO: split into transport-client.ts and transport-server.ts?

export interface TransportPlanRequest {
  operation: string;
  params: Record<string, unknown>;
  keys?: string[];
  plan: unknown; // TODO: SerializedPlan;
  streams?: OpId | Record<string, OpId>;
  outputs?: OpId | Record<string, OpId>;
}

export interface TransportPersistentRequest {
  operation: string;
  params: Record<string, unknown>;
}

export interface TransportUnbatchedRequest {
  operation: `rpc#${string}`;
  params: Record<string, unknown>;
}
