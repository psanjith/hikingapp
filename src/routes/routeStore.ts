import { getDb } from '../storage/db';
import type { SavedRoute } from './types';

/**
 * Where imported routes are saved. Like MapFileStore, the rest of the app only
 * sees this interface, so a native build could store routes differently.
 */
export interface RouteStore {
  list(): Promise<SavedRoute[]>;
  save(route: SavedRoute): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createIndexedDbRouteStore(): RouteStore {
  return {
    async list() {
      const routes = await (await getDb()).getAll('routes');
      return routes.sort((a, b) => b.importedAt - a.importedAt); // Newest first.
    },
    async save(route) {
      await (await getDb()).put('routes', route);
    },
    async remove(id) {
      await (await getDb()).delete('routes', id);
    },
  };
}
