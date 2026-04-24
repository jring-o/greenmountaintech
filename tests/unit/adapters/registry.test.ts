import { afterEach, describe, expect, it } from 'vitest';

import { _registry, registerAdapter, resolveAdapter } from '@/lib/adapters/index';
import type { Adapter } from '@/lib/adapters/types';
import { UnknownAdapterError } from '@/lib/adapters/types';

/** Minimal fake SourceRow for testing. */
function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Source',
    slug: 'test-source',
    kind: 'whitelist' as const,
    adapter_type: 'ical' as const,
    adapter_key: 'generic',
    url: 'https://example.com/cal.ics',
    adapter_config: {},
    trust_level: 'review' as const,
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

const fakeAdapter: Adapter = {
  key: 'generic',
  async *ingest() {
    // no-op
  },
};

describe('adapter registry', () => {
  afterEach(() => {
    // Remove adapters registered during tests so each test starts clean
    _registry.delete('ical:generic');
    _registry.delete('rss:generic');
    _registry.delete('html:seven-days');
  });

  it('resolveAdapter throws UnknownAdapterError for completely unknown key', () => {
    const source = fakeSource({
      adapter_type: 'html',
      adapter_key: 'nonexistent',
    });

    expect(() => resolveAdapter(source)).toThrow(UnknownAdapterError);
  });

  it('resolveAdapter throws UnknownAdapterError for unregistered key (ical:generic)', () => {
    const source = fakeSource({
      adapter_type: 'ical',
      adapter_key: 'generic',
    });

    expect(() => resolveAdapter(source)).toThrow(UnknownAdapterError);
  });

  it('resolveAdapter returns the registered adapter after registerAdapter()', () => {
    registerAdapter('ical', 'generic', fakeAdapter);

    const source = fakeSource({
      adapter_type: 'ical',
      adapter_key: 'generic',
    });

    const result = resolveAdapter(source);
    expect(result).toBe(fakeAdapter);
    expect(result.key).toBe('generic');
  });

  it('registerAdapter populates a previously empty slot', () => {
    expect(_registry.get('rss:generic')).toBeUndefined();

    registerAdapter('rss', 'generic', { ...fakeAdapter, key: 'generic' });

    expect(_registry.get('rss:generic')).not.toBeUndefined();
  });

  it('registerAdapter can add brand new adapter type:key combos', () => {
    expect(_registry.has('html:seven-days')).toBe(false);

    registerAdapter('html', 'seven-days', {
      ...fakeAdapter,
      key: 'seven-days',
    });

    expect(_registry.has('html:seven-days')).toBe(true);
  });

  it('UnknownAdapterError contains adapter type and key', () => {
    const source = fakeSource({
      adapter_type: 'json',
      adapter_key: 'custom',
    });

    try {
      resolveAdapter(source);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownAdapterError);
      if (error instanceof UnknownAdapterError) {
        expect(error.adapterType).toBe('json');
        expect(error.adapterKey).toBe('custom');
        expect(error.message).toContain('json:custom');
      }
    }
  });
});
