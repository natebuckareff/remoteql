import { tk } from 'typekind';
import { test } from 'vitest';
import { initApi } from './api.js';
import { InterpreterV2 } from './interpreter-v2.js';
import { createProxy } from './operation.js';
import { PlanBuilder } from './plan-builder.js';
import { initServer } from './server.js';
import { deepLog } from './util.js';

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
  const api = rq1.api({
    getUsers: rq1.handler(tk.void(), tk.array(tk.any())),
    getUserById: rq1.handler(tk.tuple(tk.number()), tk.any()),
  });

  const rq2 = initServer();
  const userService = rq2.service(api);

  userService.bind({
    async getUsers(): Promise<User[]> {
      return db;
    },
    async getUserById(id: number): Promise<User> {
      const user = db.find(user => user.id === id)!;
      if (user === undefined) {
        throw Error(`user not found: ${id}`);
      }
      return user;
    },
  });

  const builder = new PlanBuilder();
  const root = builder.pushParam(api);
  const rpc = createProxy<any>(builder, root);

  const me = rpc.getUserById(3).map((user: any) => ({
    id: user.id,
    name: user.name.map((name: any) => ({
      profile: { name },
    })),
  }));
  const users = rpc.getUsers();
  const firstUser = users[0];
  const usersWithFriends = users.map((user: any) => ({
    info: {
      id: user.id,
      name: user.name,
      friends: user.friends.map((id: any) => rpc.getUserById(id)),
    },
  }));

  builder.resolve(me);
  builder.resolve(firstUser);
  builder.resolve(usersWithFriends);

  const interpreter = InterpreterV2.create();
  interpreter.bind(userService);

  const frame = builder.finish();
  const results = await interpreter.evaluate(frame);
  deepLog(results);
});
