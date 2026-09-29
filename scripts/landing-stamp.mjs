// Stamp the landing stylesheet with its own content hash.
//
// Cloudflare serves the landing HTML with `max-age=0, must-revalidate` and
// tw.css with `max-age=14400`. Every deploy that changes both therefore hands
// returning visitors the NEW html and, for up to four hours, the OLD css --
// which is not a small visual drift: the page loses every responsive variant
// it gained in that deploy and renders as a single unstyled column. It is
// invisible to whoever ships it, because their browser fetched the css for the
// first time, and it is the whole site for anyone who visited yesterday.
//
// The html is always revalidated, so a hash in the query string is enough: a
// stylesheet that has not changed keeps its url and stays cached, and one that
// has changed gets a url nothing has ever cached.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'public/landing';
const css = readFileSync(join(root, 'tw.css'));
const v = createHash('sha256').update(css).digest('hex').slice(0, 10);

const pages = [
  ...readdirSync(root).filter(f => f.endsWith('.html')).map(f => join(root, f)),
  ...readdirSync(join(root, 'blog')).filter(f => f.endsWith('.html')).map(f => join(root, 'blog', f)),
];

let touched = 0;
for (const page of pages) {
  const before = readFileSync(page, 'utf8');
  // matches href="tw.css", href="../tw.css" and any stamp already on it
  const after = before.replace(
    /href="((?:\.\.\/)?tw\.css)(?:\?v=[0-9a-f]+)?"/g,
    (_, path) => `href="${path}?v=${v}"`,
  );
  if (after !== before) { writeFileSync(page, after); touched++; }
}
console.log(`landing: stamped tw.css as ?v=${v} across ${touched} page(s)`);
