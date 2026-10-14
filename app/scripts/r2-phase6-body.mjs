#!/usr/bin/env node
// Round 2, Phase 6: adds the Body summary to the top of BodyView and renames the nutrition section.
// Run from app/:  node scripts/r2-phase6-body.mjs
// Every change is checked first: if any expected line isn't found exactly once, nothing is written.
// Safe to run twice (it recognises its own work).
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/views/BodyView.tsx', import.meta.url).pathname;
const src = readFileSync(FILE, 'utf8');
if (src.includes('<BodySummary />')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const edits = [
  ['top bar', '<div className="topbar"><span className="logo">Body</span></div>',
              '<div className="topbar"><span className="logo">Body</span></div><BodySummary />'],
  ['nutrition title', '<div className="body-ttl">Nutrition</div>',
                      '<div className="body-ttl">Nutrition log and hydration</div>'],
];
let out = src;
const problems = [];
for (const [name, from, to] of edits) {
  const n = out.split(from).length - 1;
  if (n !== 1) { problems.push(`${name}: expected 1 match, found ${n}`); continue; }
  out = out.replace(from, to);
}
if (problems.length) {
  console.error('Stopped, nothing written:\n  ' + problems.join('\n  '));
  console.error('Send this output to Claude.');
  process.exit(1);
}
out = "import BodySummary from '../components/BodySummary';\n" + out;
writeFileSync(FILE, out);
console.log('BodyView updated: summary added at the top, nutrition section renamed.');
console.log('Next: npm run build');
