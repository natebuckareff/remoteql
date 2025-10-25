const nothing = (): void => {};
const captureSymbol = Symbol('capture');

export type Capture =
  | { kind: 'var' }
  | { kind: 'get'; parent: Capture; property: string }
  | { kind: 'apply'; parent: Capture; args: Capture[] }
  | { kind: 'map'; parent: Capture; args: Capture[]; output: Capture }
  | ValueCapture;

export type ValueCapture =
  | { kind: 'value'; type: 'primitive'; value: unknown }
  | { kind: 'value'; type: 'array'; value: Capture[] }
  | { kind: 'value'; type: 'object'; value: Record<string, Capture> }
  | { kind: 'value'; type: 'function' };

export type Tracker = (() => void) & { readonly [captureSymbol]: Capture };

export function isTracker(value: unknown): value is Tracker {
  return typeof value === 'function' && value[captureSymbol] !== undefined;
}

export function getCapture(value: Tracker): Capture;
export function getCapture(value: unknown): Capture | undefined;
export function getCapture(value: unknown): Capture | undefined {
  if (isTracker(value)) {
    return value[captureSymbol];
  }
}

export function createTracker<T extends object = Tracker>(source: Capture): T {
  return new Proxy<T>(nothing as any, {
    get(_target, p, _receiver) {
      if (p === captureSymbol) {
        return source;
      }

      if (typeof p === 'symbol') {
        throw Error(`cannot serialize symbols`);
      }

      return createTracker({
        kind: 'get',
        parent: source,
        property: p,
      });
    },

    apply(_target, _thisArg, argArray) {
      if (source.kind === 'get') {
        if (source.property === 'map') {
          const callback = argArray[0];
          if (argArray.length === 1 && typeof callback === 'function') {
            const args: Tracker[] = [];
            for (let i = 0; i < Math.min(callback.length, 3); ++i) {
              args.push(createTracker({ kind: 'var' }));
            }
            const result = callback(...args);

            return createTracker({
              kind: 'map',
              parent: source,
              args: args.map(arg => getCapture(arg)),
              output: wrapValue(result),
            });
          }
        }
      }

      return createTracker({
        kind: 'apply',
        parent: source,
        args: argArray.map(arg => wrapValue(arg)),
      });
    },
  });
}

function wrapValue(value: unknown): Capture {
  if (isTracker(value)) {
    return getCapture(value);
  }

  if (typeof value === 'function') {
    return {
      kind: 'value',
      type: 'function',
    };
  } else if (typeof value === 'object') {
    if (value === null) {
      return {
        kind: 'value',
        type: 'primitive',
        value: null,
      };
    }

    if (Array.isArray(value)) {
      return {
        kind: 'value',
        type: 'array',
        value: value.map(x => wrapValue(x)),
      };
    } else {
      const wrapped: Record<PropertyKey, Capture> = {};
      for (const [prop, field] of Object.entries(value)) {
        wrapped[prop] = wrapValue(field);
      }
      return {
        kind: 'value',
        type: 'object',
        value: wrapped,
      };
    }
  } else {
    return {
      kind: 'value',
      type: 'primitive',
      value: value,
    };
  }
}
