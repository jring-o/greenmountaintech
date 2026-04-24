/**
 * lib/ingest/sanitize.ts -- HTML sanitization and plain-text extraction.
 *
 * Strict allowlist for event descriptions: only safe structural tags are
 * permitted. URLs must be http(s)://.
 */

import { convert } from 'html-to-text';
import sanitize from 'sanitize-html';

/* ------------------------------------------------------------------ */
/*  Sanitize HTML with strict allowlist                                */
/* ------------------------------------------------------------------ */

const ALLOWED_TAGS = ['p', 'br', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3'];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href'],
};

const ALLOWED_SCHEMES = ['http', 'https'];

/**
 * Sanitize HTML using a strict allowlist of tags and attributes.
 * Only `<a href>` attributes are kept, and `href` values must use http(s).
 */
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
  });
}

/* ------------------------------------------------------------------ */
/*  HTML to plain text                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert HTML to plain text, stripping all markup.
 */
export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}
