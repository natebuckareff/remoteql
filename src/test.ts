import { createTracker } from "./proxy";
import { Plan } from "./plan";
import { RpcImpl, Rpc } from "./rpc-type";

class Basic extends RpcImpl {
  async getUsers(): Promise<User[]> {
    throw Error("todo");
  }

  async getUserById(id: number): Promise<User> {
    throw Error("todo");
  }
}

interface User {
  id: number;
  name: string;
  friends: number[];
}

const rpc = createTracker<Rpc<Basic>>({ kind: "var" });
const me = rpc.getUserById(42);
const users = rpc.getUsers();
const firstUser = users[0];
const usersWithFriends = users.map((user) => ({
  info: {
    id: user.id,
    friends: user.friends.map((id) => rpc.getUserById(id)),
  },
}));

const op = new Plan([me, firstUser, usersWithFriends]);
console.log(op.getFrame());
