import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every project colour a class names must exist.
 * ==========================================================================
 *
 * Tailwind does not complain about a utility it cannot resolve: it emits
 * nothing. `bg-accent-solid` named a token this theme never defined, so the
 * class produced no background at all, and with `text-white` on top the
 * button was white text on nothing -- invisible. It shipped that way twice:
 * "Download backup" (#152) and "Download Tally XML" (#153). Every test clicked
 * those buttons by their accessible name, which does not care whether anyone
 * can see them, so all of them passed.
 *
 * This reads the colour tokens the stylesheet actually defines (`--color-*`)
 * and fails on any class that names a project colour -- accent, ink, brand,
 * status -- that is not among them. Tailwind's own palette (emerald, rose …)
 * is out of scope: those always exist.
 */

const SRC = new URL('..', import.meta.url).pathname;
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

const defined = new Set([...CSS.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  });

const UTILITY = /(?<![\w-])(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|shadow)-((?:accent|ink|brand|status)-[a-z0-9-]*[a-z0-9])(?:\/[0-9.]+)?(?![\w-])/g;

describe('project colour classes', () => {
  it('reads the tokens it checks against', () => {
    // Guard the guard: an empty set would make every check below vacuous.
    expect(defined.has('accent-signature')).toBe(true);
    expect(defined.size).toBeGreaterThan(10);
  });

  it('name only colours the theme defines', () => {
    const missing = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(UTILITY)) {
        if (!defined.has(m[1])) missing.push(`${relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
