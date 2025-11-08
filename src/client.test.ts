import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { initApi } from './api.js';
import { Client } from './client.js';
import { Rpc } from './rpc-type.js';
import { initServer } from './server.js';

test('simple e2e', async () => {
  interface User {
    id: number;
    name: string;
    friends: number[];
  }

  const db: User[] = [
    { id: 1, name: 'John', friends: [2] },
    { id: 2, name: 'Jane', friends: [1] },
    { id: 3, name: 'Jim', friends: [1, 2] },
  ];

  const getApi = () => {
    const rq = initApi();
    const user = rq.api({
      getAllUsers: rq.handler(tk.void(), tk.array(tk.any<User>())),
      getUserById: rq.handler(tk.number(), tk.option(tk.any<User>())),
    });
    const router = rq.router({ user });
    return { router, user };
  };

  const api = getApi();

  const getServer = () => {
    const rq = initServer();
    const userService = rq.service(api.user).bind({
      async getAllUsers(): Promise<User[]> {
        return db;
      },
      async getUserById({ input: id }): Promise<User | undefined> {
        return db.find(user => user.id === id);
      },
    });
    const router = rq.router(api.router).bind({ user: userService });
    return rq.server({ router });
  };

  const server = getServer();

  const client = new Client({
    router: api.router,
    transport: {
      send: plan => server.evaluate(plan),
    },
  });

  const firstUser = client.api.user.getUserById(1);
  const secondUser = client.api.user.getUserById(2);
  const results = await Promise.all([firstUser, secondUser]);
  expect(results).toEqual([db[0], db[1]]);
});

test('simple streaming', async () => {
  const getApi = () => {
    const rq = initApi();
    const user = rq.api({
      handler: rq.handler(tk.number(), tk.number()),
      sequence: rq.stream(tk.number(), tk.number(), tk.string()),
    });
    const router = rq.router({ user });
    return { router, user };
  };

  const api = getApi();

  const getServer = () => {
    const rq = initServer();
    const userService = rq.service(api.user).bind({
      async handler({ input: id }) {
        return id;
      },

      async *sequence({ input: id }) {
        yield id;
        yield 1;
        yield 2;
        yield 3;
        return 'done';
      },
    });
    const router = rq.router(api.router).bind({ user: userService });
    return rq.server({ router });
  };

  const server = getServer();

  const client = new Client({
    router: api.router,
    transport: {
      send: plan => server.evaluate(plan),
    },
  });

  const stream = client.api.user.sequence(1000);
  const value = Rpc.resolve(client.api.user.handler(5000));

  const yielded: any[] = [];

  while (true) {
    const result = await stream.next();
    if (result.done) {
      expect(result.value).toEqual('done');
      break;
    }
    yielded.push(result.value);
  }

  expect(await value);
  expect(yielded).toEqual([1000, 1, 2, 3]);
});
