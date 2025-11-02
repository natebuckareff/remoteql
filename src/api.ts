import type { AnyCodec } from 'typekind';

export type AnyServiceApi = ServiceApi<HandlerApis>;
export type AnyHandlerApi = HandlerApi<AnyCodec | void, AnyCodec | void>;

export class ServiceApi<Handlers extends HandlerApis> {
  constructor(public readonly handlers: Handlers) { }
}

export interface HandlerApis {
  [name: string]: AnyHandlerApi;
}

export class HandlerApi<
  Input extends AnyCodec | void,
  Output extends AnyCodec | void,
> {
  constructor(
    public readonly input: Input,
    public readonly output: Output,
  ) { }
}

export type InferServiceType<T extends ServiceApi<HandlerApis>> = {
  [K in keyof T['handlers']]: InferHanderType<T['handlers'][K]>;
};

export type InferHanderType<T extends HandlerApi<any, any>> =
  void extends T['input'] ? () => InferHandlerOutput<T> :
  (input: T['input']['Type'],) => InferHandlerOutput<T>;

export type InferHandlerOutput<T extends HandlerApi<any, any>> =
  Promise<void extends T['output'] ? void : T['output']['Type']>;

export class ApiBuilder {
  api<Handlers extends HandlerApis>(handlers: Handlers): ServiceApi<Handlers> {
    return new ServiceApi(handlers);
  }

  handler(): HandlerApi<void, void>;

  handler<Input extends AnyCodec>(input: Input): HandlerApi<Input, void>;

  handler<Input extends AnyCodec, Output extends AnyCodec>(
    input: Input,
    output: Output,
  ): HandlerApi<Input, Output>;

  handler(
    input?: AnyCodec,
    output?: AnyCodec,
  ): HandlerApi<AnyCodec | void, AnyCodec | void> {
    return new HandlerApi(input, output);
  }
}

export function initApi(): ApiBuilder {
  return new ApiBuilder();
}
