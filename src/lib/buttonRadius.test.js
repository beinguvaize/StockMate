/**
 * The button radius system, enforced rather than described.
 *
 * Before this, 676 action buttons carried NINE different radii -- rounded-lg,
 * xl, 2xl, md, full, pill and three arbitrary pixel values. No single button
 * was wrong; the inconsistency across a toolbar was what read as unfinished.
 *
 * Two rules, because buttons come in two shapes:
 *   - a button with a LABEL (it has horizontal padding) is a pill;
 *   - an icon-only SQUARE (w-N h-N, no px-) keeps a soft square, because a
 *     circle in a dense table row is harder to aim at than a rounded square.
 *
 * Structural buttons -- a table sort header, a nav row, a dropdown item that
 * happens to be a <button> -- have no fill and no border and are not controls
 * with edges, so they are not covered.
 *
 * This is a test and not a lint rule because it needs to understand the shape
 * of a button, not just match a class name.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = new URL('..', import.meta.url).pathname;

const jsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsxFiles(p) : p.endsWith('.jsx') ? [p] : [];
  });

/** The attribute run of each <button ...>, brace-aware so `${}` does not end it. */
const buttonAttrs = (text) => {
  const out = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let i = re.lastIndex;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ attrs: text.slice(re.lastIndex, i), line: text.slice(0, m.index).split('\n').length });
  }
  return out;
};

const RADIUS = /rounded-(?:pill|full|xl|2xl|lg|md|sm|\[[^\]]+\])/g;

describe('button radius', () => {
  const offenders = [];

  for (const file of jsxFiles(SRC)) {
    for (const { attrs, line } of buttonAttrs(readFileSync(file, 'utf8'))) {
      const isAction = /\bp[xy]?-|\bh-\d/.test(attrs) && /\bbg-|\bborder\b/.test(attrs);
      const radii = attrs.match(RADIUS);
      if (!isAction || !radii) continue;

      const iconOnly = /\bw-\d/.test(attrs) && /\bh-\d/.test(attrs) && !/\bpx-/.test(attrs);
      const want = iconOnly ? 'rounded-xl' : 'rounded-pill';
      for (const found of new Set(radii)) {
        if (found !== want) {
          offenders.push(`${relative(SRC, file)}:${line} has ${found}, wants ${want}`);
        }
      }
    }
  }

  it('is two values across the whole app, not nine', () => {
    expect(offenders).toEqual([]);
  });
});

describe('coloured drop shadows', () => {
  it('are never used on a button', () => {
    // A shadow separates a surface from the one behind it. A glow in the
    // fill's own hue -- shadow-accent-signature/25 under an amber button --
    // smudges the edge it was meant to define.
    const GLOW = /shadow-(?:accent-signature|red|green|blue|amber|emerald|purple|indigo|orange|yellow|rose|sky|violet)-?\d*\/\d+/;
    const offenders = [];
    for (const file of jsxFiles(SRC)) {
      for (const { attrs, line } of buttonAttrs(readFileSync(file, 'utf8'))) {
        if (GLOW.test(attrs)) offenders.push(`${relative(SRC, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
