import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { InferRouterType, initApi } from './api.js';
import { Interpreter } from './interpreter.js';
import { createProxy, unwrapOperation } from './operation.js';
import { PlanBuilder } from './plan-builder.js';
import { Rpc } from './rpc-type.js';
import { initServer } from './server.js';

test('basic interpreter', async () => {
  interface User {
    id: number;
    name: string;
    friends: number[];
  }

  const db = [
    { id: 1, name: 'John', friends: [2] },
    { id: 2, name: 'Jane', friends: [1] },
    { id: 3, name: 'Jim', friends: [1] },
  ];

  const rq1 = initApi();
  const userApi = rq1.api({
    getUsers: rq1.handler(tk.void(), tk.array(tk.any<User>())),
    getUserById: rq1.handler(tk.number(), tk.any<User>()),
    test: rq1.handler(),
  });
  const api = rq1.router({
    user: userApi,
  });

  const rq2 = initServer();
  const userService = rq2.service(userApi).bind({
    async getUsers(): Promise<User[]> {
      return db;
    },
    async getUserById({ input: id }): Promise<User> {
      const user = db.find(user => user.id === id)!;
      if (user === undefined) {
        throw Error(`user not found: ${id}`);
      }
      return user;
    },
    async test(): Promise<void> {
      return;
    },
  });

  const router = rq2.router(api).bind({ user: userService });

  const builder = new PlanBuilder(api);
  const rpc = createProxy<Rpc<InferRouterType<typeof api>>>(
    {} as any,
    builder,
    { type: 'router', id: 0 },
  );
  const me = rpc.user.getUserById(3).map(user => ({
    id: user.id,
    name: user.name.map(name => ({
      profile: { name },
    })),
  }));
  const users = rpc.user.getUsers();
  const firstUser = users[0];
  const usersWithFriends = users.map(user => ({
    info: {
      id: user.id,
      name: user.name,
      friends: user.friends.map(id => rpc.user.getUserById(id)),
    },
  }));

  builder.pushOutput(unwrapOperation(me)!);
  builder.pushOutput(unwrapOperation(firstUser)!);
  builder.pushOutput(unwrapOperation(usersWithFriends)!);

  const interpreter = await Interpreter.create({}, router);

  const frame = builder.serialize();
  const response = interpreter.evaluate(frame);
  const results: any[] = [];
  let returned: any;
  while (true) {
    const result = await response.next();
    if (result.done) {
      returned = result.value;
      break;
    }
    results.push(result.value);
  }

  expect(results).toEqual([]);
  expect(returned).toMatchSnapshot();
});
