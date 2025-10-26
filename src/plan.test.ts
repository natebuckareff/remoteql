import { expect, test } from 'vitest';
import { Client } from './client.js';
import { Plan } from './plan.js';
import { createTracker } from './proxy.js';
import { type Rpc, RpcImpl } from './rpc-type.js';

class Basic extends RpcImpl {
  async getUsers(): Promise<User[]> {
    throw Error('todo');
  }

  async getUserById(id: number): Promise<User> {
    throw Error('todo');
  }
}

interface User {
  id: number;
  name: string;
  friends: number[];
}

test('basic plan', async () => {
  const client = new Client();
  const rpc = createTracker<Rpc<Basic>>(client, { kind: 'var' });
  const me = rpc.getUserById(42);
  const users = rpc.getUsers();
  const firstUser = users[0];
  const usersWithFriends = users.map(user => ({
    info: {
      id: user.id,
      friends: user.friends.map(id => rpc.getUserById(id)),
    },
  }));
  const plan = new Plan([me, firstUser, usersWithFriends]);
  const frame = plan.getFrame();
  expect(frame).toMatchSnapshot();
  expect(plan.getOutputs()).toEqual([2, 4, 13]);
});
