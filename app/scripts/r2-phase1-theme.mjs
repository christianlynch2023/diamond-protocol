#!/usr/bin/env node
// Round 2, Phase 1: one-off restyle of the existing screens. Run from app/:
//   node scripts/r2-phase1-theme.mjs --dry-run   (shows what would change, writes nothing)
//   node scripts/r2-phase1-theme.mjs             (applies it)
// What it does, across src/ (.css .ts .tsx .js):
//   1. Fonts: Syne -> Barlow, JetBrains Mono -> Barlow Semi Condensed.
//   2. Colours: old palette hex and rgba values -> round 2 values (same roles).
//   3. Type floor: no text below 11px (CSS font-size, inline fontSize); tracking on capitals capped at .1em.
//   4. Reports every emoji still in the code, so later phases can replace them screen by screen.
// Safe to run twice: a second run changes nothing. Review with `git diff` before committing.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const ROOT = new URL('../src/', import.meta.url).pathname;
const SKIP = new Set(['theme.css', 'chartMath.ts', 'ui.tsx', 'Icon.tsx']);
const EXTS = new Set(['.css', '.ts', '.tsx', '.js']);

const HEX = { '#07090c': '#0a0c10', '#00e87a': '#3fe0c5', '#ff8c00': '#ffb020', '#ff4444': '#ff5a4f', '#4a9eff': '#b8c2cf', '#f0a020': '#ffb020' };
const RGB = [['7,9,12', '10,12,16'], ['0,232,122', '63,224,197'], ['255,140,0', '255,176,32'], ['255,68,68', '255,90,79'], ['74,158,255', '184,194,207']];
const FLOOR = 11, TRACK_MAX = 0.12, TRACK = '.1em';

function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return EXTS.has(extname(n)) && !SKIP.has(n) ? [p] : [];
  });
}

const counts = {};
const bump = (f, k, n = 1) => { counts[f] ??= {}; counts[f][k] = (counts[f][k] || 0) + n; };

function transform(src, file) {
  const css = file.endsWith('.css');
  let s = src;
  const rep = (re, fn, key) => { s = s.replace(re, (...m) => { const out = fn(...m); if (out !== m[0]) bump(file, key); return out; }); };

  rep(/(['"])Syne\1/g, (m, q) => `${q}Barlow${q}`, 'fonts');
  rep(/font-family:\s*Syne\b/g, () => "font-family:'Barlow'", 'fonts');
  rep(/(['"])JetBrains Mono\1/g, (m, q) => `${q}Barlow Semi Condensed${q}`, 'fonts');
  rep(/#[0-9a-fA-F]{6}\b/g, m => HEX[m.toLowerCase()] || m, 'colours');
  for (const [from, to] of RGB) {
    const re = new RegExp('rgba\\(\\s*' + from.split(',').join('\\s*,\\s*') + '\\s*,', 'g');
    rep(re, () => `rgba(${to},`, 'colours');
  }
  if (css) {
    rep(/font-size:\s*(\d*\.?\d+)px/g, (m, v) => (parseFloat(v) < FLOOR ? `font-size:${FLOOR}px` : m), 'type floor');
    rep(/letter-spacing:\s*(\d*\.?\d+)em/g, (m, v) => (parseFloat(v) > TRACK_MAX ? `letter-spacing:${TRACK}` : m), 'tracking');
  } else {
    rep(/fontSize\s*:\s*(\d*\.?\d+)(?=\s*[,}])/g, (m, v) => (parseFloat(v) < FLOOR ? `fontSize:${FLOOR}` : m), 'type floor');
    rep(/fontSize\s*:\s*(['"])(\d*\.?\d+)px\1/g, (m, q, v) => (parseFloat(v) < FLOOR ? `fontSize:${q}${FLOOR}px${q}` : m), 'type floor');
    rep(/letterSpacing\s*:\s*(['"])(\d*\.?\d+)em\1/g, (m, q, v) => (parseFloat(v) > TRACK_MAX ? `letterSpacing:${q}${TRACK}${q}` : m), 'tracking');
  }
  return s;
}

const EMOJI = /\p{Extended_Pictographic}/u;
function emojiReport(src, file) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const ents = [...line.matchAll(/&#(x[0-9a-fA-F]+|\d+);/g)].map(m => String.fromCodePoint(m[1][0] === 'x' ? parseInt(m[1].slice(1), 16) : +m[1]));
    if (ents.some(c => EMOJI.test(c)) || EMOJI.test(line.replace(/[©®™]/g, ''))) out.push(`  ${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
  return out;
}

const all = files(ROOT);
const emoji = [];
let changed = 0;
for (const p of all) {
  const f = relative(ROOT, p);
  const src = readFileSync(p, 'utf8');
  const out = transform(src, f);
  if (out !== src) { changed++; if (!DRY) writeFileSync(p, out); }
  emoji.push(...emojiReport(out, f));
}

console.log(`${DRY ? 'Dry run: would change' : 'Changed'} ${changed} of ${all.length} files in src/`);
for (const [f, c] of Object.entries(counts)) console.log(`  ${f}: ${Object.entries(c).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`\nEmoji still in the code (${emoji.length} lines). These are replaced as each screen is rebuilt in phases 3 to 6:`);
console.log(emoji.length ? emoji.join('\n') : '  none');
if (!DRY) console.log('\nNext: npm run build, then review with git diff.');
