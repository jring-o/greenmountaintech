import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '@/lib/log';

describe('log', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('log.info writes JSON with msg and extra fields', () => {
    log.info('hi', { foo: 1 });

    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.msg).toBe('hi');
    expect(parsed.foo).toBe(1);
    expect(parsed.level).toBe('info');
    expect(parsed.ts).toBeDefined();
  });

  it('log.child merges ctx into every log line', () => {
    const child = log.child({ source: 'x' });
    child.info('y');

    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.msg).toBe('y');
    expect(parsed.source).toBe('x');
    expect(parsed.level).toBe('info');
  });

  it('debug is a no-op when DEBUG is not set', () => {
    const originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;

    log.debug('should not appear');

    expect(infoSpy).not.toHaveBeenCalled();

    process.env.DEBUG = originalDebug;
  });

  it('debug emits when DEBUG is enabled', () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = '1';

    log.debug('debug msg', { detail: true });

    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.msg).toBe('debug msg');
    expect(parsed.level).toBe('debug');
    expect(parsed.detail).toBe(true);

    process.env.DEBUG = originalDebug;
  });
});
