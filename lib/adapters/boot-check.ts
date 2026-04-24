import { log } from '@/lib/log';

import type { Logger } from './types';
import { UnknownAdapterError } from './types';

import { resolveAdapter } from './index';

/* ------------------------------------------------------------------ */
/*  Type for the minimal source shape needed by the boot check        */
/* ------------------------------------------------------------------ */

interface BootCheckSource {
  name: string;
  adapter_type: string;
  adapter_key: string;
}

/* ------------------------------------------------------------------ */
/*  assertAllSourceAdaptersResolvable                                  */
/* ------------------------------------------------------------------ */

/**
 * Iterates all active sources and confirms that `resolveAdapter` can
 * find a registered adapter for each one. Logs a warning for any
 * source whose adapter is missing but does **not** throw — the runner
 * can decide whether to abort.
 *
 * @param sources - Array of active source rows (or any object with
 *   the required fields). When omitted, the caller must supply them.
 * @param logger - Optional logger override (defaults to the root logger).
 * @returns An array of source names whose adapters could not be resolved.
 */
export function assertAllSourceAdaptersResolvable(
  sources: BootCheckSource[],
  logger: Logger = log,
): string[] {
  const unresolvable: string[] = [];

  for (const source of sources) {
    try {
      // resolveAdapter expects a full SourceRow but only reads
      // adapter_type and adapter_key. We cast to satisfy the signature.
      resolveAdapter(source as Parameters<typeof resolveAdapter>[0]);
    } catch (error: unknown) {
      if (error instanceof UnknownAdapterError) {
        logger.warn('unresolvable adapter for source', {
          source: source.name,
          adapterType: error.adapterType,
          adapterKey: error.adapterKey,
        });
        unresolvable.push(source.name);
      } else {
        throw error;
      }
    }
  }

  if (unresolvable.length > 0) {
    logger.warn('boot check: some sources have unresolvable adapters', {
      count: unresolvable.length,
      sources: unresolvable,
    });
  } else {
    logger.info('boot check: all source adapters resolvable', {
      count: sources.length,
    });
  }

  return unresolvable;
}
