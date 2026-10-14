#!/usr/bin/env node
// Round 2, Phase 7 clean-up. Run from app/:
//   node scripts/r2-phase7-cleanup.mjs --dry-run   (prints every change, writes nothing)
//   node scripts/r2-phase7-cleanup.mjs             (applies them)
// 1. Emoji anywhere in src/: symbols that carry meaning become plain text that keeps it
//    (⚠ → !, ⬆ → ▲, ⬇ → ▼, ✅/✔ → ✓, ❌/⛔ → ✕); purely decorative ones are removed.
// 2. Body's two hand-drawn charts: chart text raised to 11px, old grey #728aa2 → the theme's muted text.
// Prints each changed line before and after. Safe to run twice.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const ROOT = new URL('../src/', import.meta.url).pathname;
const EP = /\p{Extended_Pictographic}/u;
const MEANING = { 0x26A0: '!', 0x2B06: '\u25B2', 0x2B07: '\u25BC', 0x2705: '\u2713', 0x2714: '\u2713', 0x274C: '\u2715', 0x26D4: '\u2715' };
const files = (d) => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : ['.ts', '.tsx', '.js'].includes(extname(n)) ? [p] : []; });

function swap(cp) {
  if (MEANING[cp]) return MEANING[cp];
  const ch = String.fromCodePoint(cp);
  return EP.test(ch) && !'©®™'.includes(ch) ? '' : null;   // '' = decorative, remove; null = not an emoji, leave
}
function fixEmoji(line) {
  // HTML numeric entities, with an optional variation selector and one trailing space when removed
  let s = line.replace(/&#(x[0-9a-fA-F]+|\d+);(&#65039;|\uFE0F)?( ?)/g, (m, code, _vs, sp) => {
    const cp = code[0] === 'x' ? parseInt(code.slice(1), 16) : +code;
    const r = swap(cp);
    return r === null ? m : r === '' ? '' : r + sp;
  });
  // literal emoji characters
  s = s.replace(/(\p{Extended_Pictographic})\uFE0F?( ?)/gu, (m, ch, sp) => {
    const r = swap(ch.codePointAt(0));
    return r === null ? m : r === '' ? '' : r + sp;
  });
  return s;
}
function fixChartText(line) {
  return line
    .replace(/fontSize=(["'])(\d*\.?\d+)\1/g, (m, q, v) => (parseFloat(v) < 11 ? `fontSize=${q}11${q}` : m))
    .replace(/fontSize=\{(\d*\.?\d+)\}/g, (m, v) => (parseFloat(v) < 11 ? 'fontSize={11}' : m))
    .replace(/fill=(["'])#728aa2\1/gi, 'fill="var(--t3)"');
}

let changed = 0;
for (const p of files(ROOT)) {
  const f = relative(ROOT, p);
  const src = readFileSync(p, 'utf8');
  const lines = src.split('\n');
  const out = lines.map((line, i) => {
    let s = fixEmoji(line);
    if (f === 'views/BodyView.tsx') s = fixChartText(s);
    if (s !== line) {
      changed++;
      console.log(`\n${f}:${i + 1}\n  before: ${line.trim().slice(0, 150)}\n  after:  ${s.trim().slice(0, 150)}`);
    }
    return s;
  });
  if (!DRY && out.join('\n') !== src) writeFileSync(p, out.join('\n'));
}
console.log(`\n${DRY ? 'Dry run: would change' : 'Changed'} ${changed} line${changed === 1 ? '' : 's'}.${DRY ? '' : ' Next: npm run build, then node scripts/r2-audit.mjs'}`);
