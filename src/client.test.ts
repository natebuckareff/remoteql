import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { initApi } from './api.js';
import { Client } from './client.js';
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
      send: async plan => {
        return server.evaluate(plan);
      },
    },
  });

  const firstUser = client.api.user.getUserById(1);
  const secondUser = client.api.user.getUserById(2);
  const results = await Promise.all([firstUser, secondUser]);
  expect(results).toEqual([db[0], db[1]]);
});
