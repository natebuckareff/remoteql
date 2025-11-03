import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { initApi } from './api.js';
import { InjectFn, initServer } from './server.js';

test('basic server', async () => {
  const getApi = () => {
    const rq = initApi();
    const foo = rq.api({
      doSomethingFoo: rq.handler(tk.string(), tk.string()),
    });
    const bar = rq.api({
      doSomethingBar: rq.handler(tk.string(), tk.string()),
    });
    const router = rq.router({ foo, bar });
    return { foo, bar, router };
  };

  interface Context {
    inject: InjectFn;
  }

  const api = getApi();
  const rq = initServer().context<Context>(async ({ inject }) => {
    return { inject };
  });

  const foo = rq.service(api.foo).bind({
    async doSomethingFoo({ cx, input }) {
      const barService = cx.inject(api.bar);
      const result = await barService.doSomethingBar(input);
      return 'FOO: ' + result;
    },
  });

  const bar = rq.service(api.bar).bind({
    async doSomethingBar({ input }) {
      return input.toUpperCase();
    },
  });

  const router = rq.router(api.router).bind({
    foo,
    bar,
  });

  const server = rq.server({
    router,
    context: async ({ inject }) => ({ inject }),
  });

  const cx = await server.createContext();
  const fooService = cx.inject(api.foo);
  const result = await fooService.doSomethingFoo('hello');

  expect(result).toBe('FOO: HELLO');
});
