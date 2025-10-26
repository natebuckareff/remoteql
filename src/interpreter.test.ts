import { expect, test } from 'vitest';
import { Client } from './client.js';
import { Interpreter } from './interpreter.js';
import { Frame, Plan } from './plan.js';
import { createTracker } from './proxy.js';
import { Rpc, RpcImpl } from './rpc-type.js';

test('basic interpreter', async () => {
  class Basic extends RpcImpl {
    constructor(private users: User[]) {
      super();
    }

    async getUsers(): Promise<User[]> {
      return this.users;
    }

    async getUserById(id: number): Promise<User> {
      const user = this.users.find(user => user.id === id)!;
      if (user === undefined) {
        throw Error(`user not found: ${id}`);
      }
      return user;
    }
  }

  interface User {
    id: number;
    name: string;
    friends: number[];
  }

  const client = new Client();
  const rpc = createTracker<Rpc<Basic>>(client, { kind: 'var' });
  const me = rpc.getUserById(3);
  const users = rpc.getUsers();
  const firstUser = users[0];
  const usersWithFriends = users.map(user => ({
    info: {
      id: user.id,
      friends: user.friends.map(id => rpc.getUserById(id)),
    },
  }));

  const basic = new Basic([
    { id: 1, name: 'John', friends: [2] },
    { id: 2, name: 'Jane', friends: [1] },
    { id: 3, name: 'Jim', friends: [1] },
  ]);

  const interpreter = Interpreter.create();
  interpreter.bind(basic);

  const plan = new Plan([me, firstUser, usersWithFriends]);
  const results = await interpreter.evaluate(plan);
  expect(results).toMatchSnapshot();
});

test('rejects on undefined ref', async () => {
  const plan = {
    getFrame(): Frame {
      return {
        0: ['get', 100, 'x'],
      };
    },
  };
  const interpreter = Interpreter.create();
  const promise = interpreter.evaluate(plan as Plan);
  await expect(promise).rejects.toThrow('ref not defined: 100');
});

test('rejects on duplicate ref definitions', async () => {
  const plan = {
    getFrame(): Frame {
      return {
        0: {
          params: [1, 1], // 1 will be defined twice
          frame: {
            0: ['let', 'foo'],
          },
          outputs: [0],
        },
        1: ['let', [[1, 2, 3]]],
        2: ['call', [1, 'map'], 0],
      };
    },
    getOutputs(): number[] {
      return [0];
    },
  };
  const interpreter = Interpreter.create();
  const promise = interpreter.evaluate(plan as Plan);
  await expect(promise).rejects.toThrow('ref already defined: 1');
});

test('optional chaining', async () => {
  const plan = {
    getFrame(): Frame {
      return {
        0: ['let', { foo: {} }],
        1: ['get', 0, 'foo', 'bar', 'baz'],
      };
    },
    getOutputs(): number[] {
      return [1];
    },
  };
  const interpreter = Interpreter.create();
  const result = await interpreter.evaluate(plan as Plan);
  expect(result).toEqual([undefined]);
});

test('throws if impl method not found', async () => {
  const plan = {
    getFrame(): Frame {
      return {
        1: ['get', 0, 'method'],
      };
    },
    getOutputs(): number[] {
      return [1];
    },
  };

  const interpreter = Interpreter.create();
  class Basic extends RpcImpl {}
  interpreter.bind(new Basic());

  const promise = interpreter.evaluate(plan as Plan);
  await expect(promise).rejects.toThrow('method not found: method');
});

test('handles nested promises', async () => {
  const plan = {
    getFrame(): Frame {
      return {
        1: ['call', [0, 'method']],
        2: ['get', 1, 'foo'],
      };
    },
    getOutputs(): number[] {
      return [2];
    },
  };

  const interpreter = Interpreter.create();
  class Basic extends RpcImpl {
    async method() {
      return {
        foo: Promise.resolve(100), // return nested promise
      };
    }
  }
  interpreter.bind(new Basic());

  const result = await interpreter.evaluate(plan as Plan);
  expect(result).toEqual([100]);
});
