import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * S07 requires CSS theme tokens for the Vermont design system.
 * These tests verify the globals.css file contains the expected tokens.
 */
const cssPath = resolve(__dirname, '../../app/globals.css');
const css = readFileSync(cssPath, 'utf-8');

describe('globals.css Vermont theme tokens', () => {
  it('defines --color-vermont-forest', () => {
    expect(css).toContain('--color-vermont-forest');
    expect(css).toMatch(/--color-vermont-forest:\s*#2d5f2d/i);
  });

  it('defines --color-vermont-slate', () => {
    expect(css).toContain('--color-vermont-slate');
    expect(css).toMatch(/--color-vermont-slate:\s*#4a5568/i);
  });

  it('defines --color-vermont-cream', () => {
    expect(css).toContain('--color-vermont-cream');
    expect(css).toMatch(/--color-vermont-cream:\s*#faf7f2/i);
  });

  it('defines --color-vermont-accent', () => {
    expect(css).toContain('--color-vermont-accent');
    expect(css).toMatch(/--color-vermont-accent:\s*#b7472a/i);
  });

  it('defines --font-display CSS variable in :root', () => {
    expect(css).toMatch(/--font-display:\s*['"]?Libre Baskerville/);
  });

  it('defines --font-sans CSS variable in :root', () => {
    expect(css).toMatch(/--font-sans:\s*['"]?Source Sans 3/);
  });

  it('registers --font-display in @theme inline block', () => {
    // The @theme inline block should map --font-display for Tailwind v4
    expect(css).toMatch(/@theme\s+inline\s*\{[\s\S]*--font-display/);
  });

  it('registers --font-sans in @theme inline block', () => {
    expect(css).toMatch(/@theme\s+inline\s*\{[\s\S]*--font-sans/);
  });
});
