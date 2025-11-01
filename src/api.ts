import type { AnyCodec, InferCodecType } from 'typekind';

export type AnyServiceApi = ServiceApi<HandlerApis>;
export type AnyHandlerApi = HandlerApi<AnyCodec, AnyCodec | void>;

export class ServiceApi<Handlers extends HandlerApis> {
  constructor(public readonly handlers: Handlers) {}
}

export interface HandlerApis {
  [name: string]: AnyHandlerApi;
}

export class HandlerApi<
  Input extends AnyCodec,
  Output extends AnyCodec | void,
> {
  constructor(
    public readonly input: Input,
    public readonly output: Output,
  ) {}
}

export type InferServiceType<T extends ServiceApi<HandlerApis>> = {
  [K in keyof T['handlers']]: InferHanderType<T['handlers'][K]>;
};

export type InferHanderType<T extends HandlerApi<any, any>> = (
  input: InferCodecType<T['input']>,
) => Promise<void extends T['output'] ? void : InferCodecType<T['output']>>;

export class ApiBuilder {
  api<Handlers extends HandlerApis>(handlers: Handlers): ServiceApi<Handlers> {
    return new ServiceApi(handlers);
  }

  handler<Input extends AnyCodec>(input: Input): HandlerApi<Input, void>;

  handler<Input extends AnyCodec, Output extends AnyCodec>(
    input: Input,
    output: Output,
  ): HandlerApi<Input, Output>;

  handler(
    input: AnyCodec,
    output?: AnyCodec,
  ): HandlerApi<AnyCodec, AnyCodec | void> {
    return new HandlerApi(input, output);
  }
}

export function initApi(): ApiBuilder {
  return new ApiBuilder();
}
