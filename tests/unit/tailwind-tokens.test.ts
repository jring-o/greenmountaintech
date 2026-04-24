import { describe, expect, it } from 'vitest';

import config from '@/tailwind.config';

/**
 * S07 requires specific Vermont design tokens in tailwind.config.ts.
 * These tests verify the token names and hex values match the spec.
 */
describe('tailwind.config.ts Vermont tokens', () => {
  const vermontColors = (config.theme?.extend?.colors as Record<string, Record<string, string>>)
    ?.vermont;

  it('defines vermont color tokens', () => {
    expect(vermontColors).toBeDefined();
  });

  it('vermont.forest is #2D5F2D', () => {
    expect(vermontColors?.forest).toBe('#2D5F2D');
  });

  it('vermont.slate is #4A5568', () => {
    expect(vermontColors?.slate).toBe('#4A5568');
  });

  it('vermont.cream is #FAF7F2', () => {
    expect(vermontColors?.cream).toBe('#FAF7F2');
  });

  it('vermont.accent is #B7472A', () => {
    expect(vermontColors?.accent).toBe('#B7472A');
  });

  it('defines font-display and font-sans families', () => {
    const fontFamily = config.theme?.extend?.fontFamily as Record<string, string[]> | undefined;
    expect(fontFamily?.display).toEqual(['var(--font-display)']);
    expect(fontFamily?.sans).toEqual(['var(--font-sans)']);
  });
});
