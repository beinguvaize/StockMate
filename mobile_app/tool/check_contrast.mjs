#!/usr/bin/env node
/**
 * Contrast gate for the mobile design tokens.
 *
 * Parses lib/core/theme/colors.dart and asserts every declared foreground /
 * background pairing meets WCAG AA. Run before committing a token change:
 *
 *   node tool/check_contrast.mjs
 *
 * This exists because six of the thirteen original pairings failed — including
 * onPrimary on primary, the most-used pair in the app — and nothing caught it.
 * Each screen inherited the fault and was fixed by hand, repeatedly.
 */
import { readFileSync } from 'node:fs';

const SRC = new URL('../lib/core/theme/colors.dart', import.meta.url);

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (hex) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb(hex).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
};

// Pull `static const Color name = Color(0xFFRRGGBB);` out of the Dart source so
// the gate always tests what actually ships, not a copy that can drift.
const source = readFileSync(SRC, 'utf8');
const tokens = {};
for (const m of source.matchAll(/static const Color (\w+)\s*=\s*Color\(0x[fF]{2}([0-9a-fA-F]{6})\)/g)) {
  tokens[m[1]] = `#${m[2].toUpperCase()}`;
}

// Text needs 4.5:1. UI boundaries that carry meaning (input borders, focus
// rings, control outlines) need 3:1 under WCAG 1.4.11. Purely decorative
// hairlines are exempt and are not listed here.
const PAIRS = [
  ['onPrimary', 'primary', 4.5, 'button label on brand fill'],
  ['onPrimaryContainer', 'primaryContainer', 4.5, 'text on amber tint'],
  ['onSurface', 'canvas', 4.5, 'body text'],
  ['onSurfaceVariant', 'canvas', 4.5, 'secondary text'],
  ['inkTertiary', 'canvas', 4.5, 'muted text'],
  ['inkTertiary', 'surfaceContainer', 4.5, 'muted text on raised surface'],
  ['onSurface', 'surfaceContainer', 4.5, 'body text on raised surface'],
  ['success', 'canvas', 4.5, 'success text'],
  ['error', 'canvas', 4.5, 'error text'],
  ['warning', 'canvas', 4.5, 'warning text'],
  ['info', 'canvas', 4.5, 'info text'],
  ['primary', 'canvas', 4.5, 'brand colour used as text'],
  ['onSuccessContainer', 'successContainer', 4.5, 'text on success tint'],
  ['onErrorContainer', 'errorContainer', 4.5, 'text on error tint'],
  ['onWarningContainer', 'warningContainer', 4.5, 'text on warning tint'],
  ['onInfoContainer', 'infoContainer', 4.5, 'text on info tint'],
  ['outline', 'canvas', 3, 'control border'],
  ['slate600', 'canvas', 4.5, 'slate body text'],
  ['slate500', 'canvas', 4.5, 'slate muted text'],
];

let failures = 0;
let missing = 0;
console.log('\nToken contrast — WCAG AA\n');
for (const [fg, bg, min, label] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) {
    console.log(`  SKIP  ${label.padEnd(34)} (missing ${!tokens[fg] ? fg : bg})`);
    missing++;
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} ${String(r).padStart(6)}:1  ` +
    `(${fg} on ${bg}, needs ${min})`
  );
}

console.log(
  `\n${Object.keys(tokens).length} tokens · ${PAIRS.length - missing} pairs checked · ` +
  `${failures} failing${missing ? ` · ${missing} skipped` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
