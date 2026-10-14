#!/usr/bin/env node
// Round 2, Phase 7 audit. Run from app/ after `npm run build`:  node scripts/r2-audit.mjs
// Reports (changes nothing): emoji left in the code, text below 11px, text colours that may be too
// faint on a card, and bundle sizes. Paste the output to Claude; every item gets checked against the
// source before anything is changed.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const DIST = new URL('../dist/assets/', import.meta.url).pathname;
const CARD = '#12161c';
// Rules whose background is the lime accent, set elsewhere in the stylesheet.
const ON_LIME = ['.wr-dot', '.add-toggle.add-primary'];
const files = (d) => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : ['.css', '.ts', '.tsx', '.js'].includes(extname(n)) ? [p] : []; });
const lum = (h) => { const n = parseInt(h.slice(1), 16); const c = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const EMOJI = /\p{Extended_Pictographic}/u;
const out = { emoji: [], small: [], faint: [] };

for (const p of files(ROOT)) {
  const f = relative(ROOT, p);
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    const ents = [...line.matchAll(/&#(x[0-9a-fA-F]+|\d+);/g)].map(m => String.fromCodePoint(m[1][0] === 'x' ? parseInt(m[1].slice(1), 16) : +m[1]));
    if (ents.some(c => EMOJI.test(c)) || EMOJI.test(line.replace(/[©®™]/g, ''))) out.emoji.push(`  ${at}  ${line.trim().slice(0, 80)}`);
    for (const m of line.matchAll(/font-size:\s*(\d*\.?\d+)px|fontSize\s*[:=]\s*\{?\s*['"]?(\d*\.?\d+)/g)) {
      const v = parseFloat(m[1] ?? m[2]);
      if (v < 11) out.small.push(`  ${at}  ${v}px  ${line.trim().slice(0, 70)}`);
    }
    // Dark text on lime (buttons, chips, dots) is correct, so rules that sit on the accent are skipped.
    const onLime = line.includes('var(--acc)') || ON_LIME.some(sel => line.trim().startsWith(sel));
    if (f.endsWith('.css') && !onLime) for (const m of line.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{6})\b/g)) {
      const r = ratio(m[1], CARD);
      if (r < 4.5) out.faint.push(`  ${at}  ${m[1]} is ${r.toFixed(2)}:1 on a card  ${line.trim().slice(0, 60)}`);
    }
  });
}

const sect = (title, list, note) => { console.log(`\n${title}: ${list.length}${note ? '  (' + note + ')' : ''}`); if (list.length) console.log(list.slice(0, 60).join('\n') + (list.length > 60 ? `\n  ...and ${list.length - 60} more` : '')); };
console.log('Round 2 audit');
sect('Emoji still in the code', out.emoji);
sect('Text below 11px', out.small, 'charts are drawn in a 320-wide box shown about 10% larger, so 10 there is borderline');
sect('Text colours under 4.5:1 on a card', out.faint, 'some may sit on light buttons, where dark text is correct');

if (existsSync(DIST)) {
  const assets = readdirSync(DIST).filter(n => /\.(js|css)$/.test(n)).map(n => ({ n, kb: statSync(join(DIST, n)).size / 1024 })).sort((a, b) => b.kb - a.kb);
  console.log('\nBundle (before compression):');
  for (const a of assets) console.log(`  ${a.kb.toFixed(0).padStart(5)} kB  ${a.n}${a.kb > 500 ? '  << over 500 kB' : ''}`);
} else console.log('\nBundle: run npm run build first to see sizes.');
