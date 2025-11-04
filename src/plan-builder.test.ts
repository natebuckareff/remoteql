import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { initApi } from './api.js';
import { createProxy, unwrapOperation } from './operation.js';
import { PlanBuilder } from './plan-builder.js';

test('basic plan', async () => {
  const rq = initApi();
  const userApi = rq.api({
    getUsers: rq.handler(tk.void(), tk.array(tk.any())),
    getUserById: rq.handler(tk.number(), tk.any()),
  });
  const api = rq.router({
    user: userApi,
  });

  const builder = new PlanBuilder();
  const root = builder.pushParam(api);
  const rpc = createProxy<any>({} as any, builder, root);
  const me = rpc.user.getUserById(42);
  const users = rpc.user.getUsers().map((user: any) => ({
    id: user.id,
    friends: user.friends,
  }));
  const firstUser = users[0];
  const firstUserId = firstUser.id;

  const usersWithFriends = users.map((user: any) => ({
    info: {
      id: user.id,
      friends: user.friends.map((id: any) => rpc.user.getUserById(id)),
    },
  }));

  builder.pushOutput(unwrapOperation(me)!);
  builder.pushOutput(unwrapOperation(firstUser)!);
  builder.pushOutput(unwrapOperation(firstUserId)!);
  builder.pushOutput(unwrapOperation(usersWithFriends)!);

  const frame = builder.finish();
  expect(frame).toMatchSnapshot();
});

test('kitchen sink test', () => {
  const rq = initApi();
  const userApi = rq.api({
    getUserById: rq.handler(tk.bigint(), tk.any()),
    getBestFriendOf: rq.handler(tk.number(), tk.any()),
    getThing: rq.handler(tk.number(), tk.void()),
    doSomething: rq.handler(
      tk.object({
        value: tk.number(),
        thing: tk.any(),
        when: tk.date(),
      }),
      tk.void(),
    ),
  });
  const api = rq.router({
    user: userApi,
  });

  const builder = new PlanBuilder();
  const root = builder.pushParam(api);
  const client = createProxy<any>({} as any, builder, root);

  const now = 1762035193626;

  client.user.getUserById(42n).map((me: any) => {
    const friends = me.friends.map((id: any) => client.user.getUserById(id));
    const bestFriend = client.user.getBestFriendOf(me.id);

    return {
      id: me.id,
      numbers: [1, 2, 3],
      now: new Date(now),
      big: 100n,
      friends,
      bestFriend,
      bestFriend2: [0, bestFriend],
    };
  });

  const thing = client.user.getThing(100);

  const data = {
    value: 100,
    thing: thing.foo.bar,
    when: new Date(now),
  };

  client.user.doSomething(data);
  client.user.doSomething(data);

  expect(builder.finish()).toMatchSnapshot();
});
