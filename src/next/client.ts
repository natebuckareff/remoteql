import type { AnyRouterApi } from '../api.js';
import { ClientDev } from './client-dev.js';
import { ClientProd } from './client-prod.js';
import type { ClientNextConfig, IClient } from './client-type.js';

export function createClient<Router extends AnyRouterApi>(
  config: ClientNextConfig<Router>,
): IClient<Router> {
  if (import.meta.env.DEV) {
    return new ClientDev(config);
  } else {
    return new ClientProd(config);
  }
}
