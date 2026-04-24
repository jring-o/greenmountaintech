import type { SourceRow } from '@/lib/db/schema';

import { helloBurlingtonVtAdapter } from './html/hello-burlington-vt';
import { sevenDaysAdapter } from './html/seven-days';
import { vermontComAdapter } from './html/vermont-com';
import { vermontPublicAdapter } from './html/vermont-public';
import { icalAdapter } from './ical';
import { rssAdapter } from './rss';
import type { Adapter } from './types';
import { UnknownAdapterError } from './types';

/* ------------------------------------------------------------------ */
/*  Registry – keyed by "${adapter_type}:${adapter_key}"              */
/* ------------------------------------------------------------------ */

const registry = new Map<string, Adapter>();

/* ------------------------------------------------------------------ */
/*  registerAdapter                                                    */
/* ------------------------------------------------------------------ */

/**
 * Register an adapter implementation for a given type + key combination.
 * Called by each adapter module at import time.
 */
export function registerAdapter(type: string, key: string, impl: Adapter): void {
  registry.set(`${type}:${key}`, impl);
}

/* ------------------------------------------------------------------ */
/*  resolveAdapter                                                     */
/* ------------------------------------------------------------------ */

/**
 * Resolve the adapter for the given source row.
 * Throws `UnknownAdapterError` if no adapter is registered.
 */
export function resolveAdapter(source: SourceRow): Adapter {
  const registryKey = `${source.adapter_type}:${source.adapter_key}`;
  const adapter = registry.get(registryKey);

  if (!adapter) {
    throw new UnknownAdapterError(source.adapter_type, source.adapter_key);
  }

  return adapter;
}

/* ------------------------------------------------------------------ */
/*  Register real adapter implementations                              */
/* ------------------------------------------------------------------ */

registerAdapter('ical', 'generic', icalAdapter);
registerAdapter('rss', 'generic', rssAdapter);
registerAdapter('html', 'hello-burlington-vt', helloBurlingtonVtAdapter); // html:hello-burlington-vt
registerAdapter('html', 'seven-days', sevenDaysAdapter); // html:seven-days
registerAdapter('html', 'vermont-com', vermontComAdapter); // html:vermont-com
registerAdapter('html', 'vermont-public', vermontPublicAdapter); // html:vermont-public

/* ------------------------------------------------------------------ */
/*  Expose registry for testing                                        */
/* ------------------------------------------------------------------ */

/** @internal – exposed for unit tests and admin UI. */
export const _registry = registry;

/**
 * Returns a map of adapter_type -> adapter_key[] for populating the admin
 * source form's adapter_key dropdown.
 */
export function getAdapterKeysByType(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const compositeKey of registry.keys()) {
    const [type, key] = compositeKey.split(':');
    if (!type || !key) continue;
    if (!result[type]) result[type] = [];
    result[type].push(key);
  }
  return result;
}
