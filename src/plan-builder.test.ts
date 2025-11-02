import { tk } from 'typekind';
import { expect, test } from 'vitest';
import { initApi } from './api.js';
import { createProxy } from './operation.js';
import { PlanBuilder } from './plan-builder.js';

test('basic plan', async () => {
  const rq = initApi();
  const api = rq.api({
    getUsers: rq.handler(tk.void(), tk.array(tk.any())),
    getUserById: rq.handler(tk.number(), tk.any()),
  });

  const builder = new PlanBuilder();
  const root = builder.pushParam(api);
  const rpc = createProxy<any>(builder, root);
  const me = rpc.getUserById(42);
  const users = rpc.getUsers().map((user: any) => ({
    id: user.id,
    friends: user.friends,
  }));
  const firstUser = users[0];
  const firstUserId = firstUser.id;

  const usersWithFriends = users.map((user: any) => ({
    info: {
      id: user.id,
      friends: user.friends.map((id: any) => rpc.getUserById(id)),
    },
  }));

  builder.resolve(me);
  builder.resolve(firstUser);
  builder.resolve(firstUserId);
  builder.resolve(usersWithFriends);

  const frame = builder.finish();
  expect(frame).toMatchSnapshot();
});

test('kitchen sink test', () => {
  const rq = initApi();
  const api = rq.api({
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

  const builder = new PlanBuilder();
  const root = builder.pushParam(api);
  const client = createProxy<any>(builder, root);

  const now = 1762035193626;

  client.getUserById(42n).map((me: any) => {
    const friends = me.friends.map((id: any) => client.getUserById(id));
    const bestFriend = client.getBestFriendOf(me.id);

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

  const thing = client.getThing(100);

  const data = {
    value: 100,
    thing: thing.foo.bar,
    when: new Date(now),
  };

  client.doSomething(data);
  client.doSomething(data);

  expect(builder.finish()).toMatchSnapshot();
});
