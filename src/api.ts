import { type AnyCodec, tk, type VoidCodec } from 'typekind';

// TODO: handler/stream naming could be improved

export type AnyRouterApi = RouterApi<RouterSpec>;
export type AnyServiceApi = ServiceApi<HandlerApis>;
export type AnyHandlerApi = HandlerApi<AnyCodec | void, AnyCodec | void>;
export type AnyStreamApi = StreamApi<AnyCodec, AnyCodec, AnyCodec>;

export class RouterApi<Routes extends RouterSpec> {
  constructor(public readonly routes: Routes) {}
}

export interface RouterSpec {
  [name: string]: AnyServiceApi | AnyRouterApi;
}

export class ServiceApi<Handlers extends HandlerApis> {
  constructor(public readonly handlers: Handlers) {}
}

export interface HandlerApis {
  [name: string]: AnyHandlerApi | AnyStreamApi;
}

export class HandlerApi<
  Input extends AnyCodec | void,
  Output extends AnyCodec | void,
> {
  public readonly kind = 'handler';

  constructor(
    public readonly input: Input,
    public readonly output: Output,
  ) {}
}

// TODO: can just use tk.void() so drop defaults
export class StreamApi<
  Input extends AnyCodec,
  Value extends AnyCodec,
  Output extends AnyCodec,
> {
  public readonly kind = 'stream';

  constructor(
    public readonly input: Input,
    public readonly value: Value,
    public readonly output: Output,
  ) {}
}

export type InferRouterType<T extends AnyRouterApi> = {
  [K in keyof T['routes']]: T['routes'][K] extends AnyServiceApi
    ? InferServiceType<T['routes'][K]>
    : InferRouterType<Extract<T['routes'][K], AnyRouterApi>>;
};

export type InferServiceType<T extends ServiceApi<HandlerApis>> = {
  [K in keyof T['handlers']]: InferHandlerType<T['handlers'][K]>;
};

export type InferHandlerType<T> = T extends HandlerApi<any, any>
  ? InferNormalHandlerType<T>
  : T extends StreamApi<any, any, any>
    ? InferStreamType<T>
    : never;

export type InferNormalHandlerType<T extends HandlerApi<any, any>> =
  void extends T['input']
    ? () => InferNormalHandlerOutput<T>
    : (input: T['input']['Type']) => InferNormalHandlerOutput<T>;

export type InferNormalHandlerOutput<T extends HandlerApi<any, any>> = Promise<
  void extends T['output'] ? void : T['output']['Type']
>;

export type InferStreamType<T extends StreamApi<any, any, any>> =
  void extends T['input']['Type']
    ? () => AsyncGenerator<T['value']['Type'], T['output']['Type'], void>
    : (
        input: T['input']['Type'],
      ) => AsyncGenerator<T['value']['Type'], T['output']['Type'], void>;

export class ApiBuilder {
  router<Routes extends RouterSpec>(routes: Routes): RouterApi<Routes> {
    return new RouterApi(routes);
  }

  api<Handlers extends HandlerApis>(handlers: Handlers): ServiceApi<Handlers> {
    return new ServiceApi(handlers);
  }

  stream<Value extends AnyCodec>(
    value: Value,
  ): StreamApi<VoidCodec, Value, VoidCodec>;

  stream<Input extends AnyCodec, Value extends AnyCodec>(
    input: Input,
    value: Value,
  ): StreamApi<Input, Value, VoidCodec>;

  stream<
    Input extends AnyCodec,
    Value extends AnyCodec,
    Output extends AnyCodec,
  >(
    input: Input,
    value: Value,
    output: Output,
  ): StreamApi<Input, Value, Output>;

  stream(
    valueOrInput: AnyCodec,
    value?: AnyCodec,
    output?: AnyCodec,
  ): StreamApi<AnyCodec, AnyCodec, AnyCodec> {
    if (output === undefined) {
      return value === undefined
        ? new StreamApi(tk.void(), valueOrInput, tk.void())
        : new StreamApi(valueOrInput, value, tk.void());
    } else {
      return new StreamApi(valueOrInput, value!, output);
    }
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
