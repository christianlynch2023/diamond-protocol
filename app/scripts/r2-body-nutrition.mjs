#!/usr/bin/env node
// Body nutrition clean-up (option A). Run from app/:
//   node scripts/r2-body-nutrition.mjs --dry-run   (shows exactly what changes; writes nothing)
//   node scripts/r2-body-nutrition.mjs             (applies it)
// Inside Body's "Smart targets" card it removes only the two things Fuel now owns:
//   - the target lock box   (className "tl-box": active target, live maintenance, next target, lock at)
//   - the maintenance line  (className "nc-ctx", both versions)
// It renames the card "Daily targets and hydration", adds a pointer to Fuel at the top of the nutrition
// section, and drops app-state names nothing uses any more. Today's targets, the hydration and electrolytes
// calculator and the live advice lines all stay. Each target is found by exact class name; if any is not
// found exactly as expected, nothing is written. Safe to run twice.
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const DRY = process.argv.includes('--dry-run');
const FILE = new URL('../src/views/BodyView.tsx', import.meta.url).pathname;
const MARK = 'bn2-fuel';
const fail = (m) => { console.error('Stopped, nothing written: ' + m + '\nSend this output to Claude.'); process.exit(1); };

let src = readFileSync(FILE, 'utf8');
if (src.includes(MARK)) { console.log('Already applied. Nothing to do.'); process.exit(0); }
const parse = (s) => ts.createSourceFile('BodyView.tsx', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sf = parse(src);
const unwrap = (e) => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };
const visible = (node) => { const out = []; const w = (n) => { if (n.kind === ts.SyntaxKind.JsxText) out.push(n.getText(sf)); ts.forEachChild(n, w); }; w(node); return out.join(' ').replace(/\s+/g, ' ').trim(); };
const clsText = (el) => {
  const open = ts.isJsxElement(el) ? el.openingElement : ts.isJsxSelfClosingElement(el) ? el : null;
  if (!open) return null;
  const a = open.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'className');
  return a && a.initializer ? a.initializer.getText(sf) : null;
};
const hasClass = (el, c) => { const t = clsText(el); return !!t && new RegExp(`(^|[\\s'"{])${c}($|[\\s'"}])`).test(t); };
const all = (root, pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); ts.forEachChild(n, w); }; w(root); return out; };
// The piece to delete for an element: the whole child of its parent JSX (so `{cond && <div/>}` goes as one).
const removable = (n) => { let x = n; while (x.parent && !ts.isJsxElement(x.parent) && !ts.isJsxFragment(x.parent)) x = x.parent; return x; };

// The nutrition section and the Smart targets card inside it
let section = null;
for (const n of all(sf, n => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
  if (ts.isCallExpression(n.left) && n.left.expression.getText(sf) === 'secOpen' && n.left.arguments[0] && ts.isStringLiteral(n.left.arguments[0]) && n.left.arguments[0].text === 'nutrition') {
    const r = unwrap(n.right); if (r && (ts.isJsxFragment(r) || ts.isJsxElement(r))) { section = r; break; }
  }
}
if (!section) fail("could not find the nutrition section (secOpen('nutrition') && ...)");
const cards = all(section, n => ts.isJsxElement(n) && hasClass(n, 'nc') && /Smart targets/.test(visible(n)));
if (cards.length !== 1) fail(`expected 1 Smart targets card, found ${cards.length}`);
const card = cards[0];

// Targets
const tl = all(card, n => ts.isJsxElement(n) && hasClass(n, 'tl-box'));
if (tl.length !== 1) fail(`expected 1 target lock box (tl-box), found ${tl.length}`);
const ctx = all(card, n => ts.isJsxElement(n) && hasClass(n, 'nc-ctx'));
if (ctx.length < 1 || ctx.length > 2) fail(`expected 1 or 2 maintenance lines (nc-ctx), found ${ctx.length}`);
const doomed = [...new Set([removable(tl[0]), ...ctx.map(removable)])];
if (doomed.length > 3) fail(`expected at most 3 pieces to remove, found ${doomed.length}`);
for (const d of doomed) if (/hydration|electrolyte|Eat today|Training day|nc-adj/i.test(d.getText(sf))) fail('a piece to remove also contains targets, hydration or advice');
const title = all(card, n => n.kind === ts.SyntaxKind.JsxText && /^\s*Smart targets\s*$/.test(n.getText(sf)));
if (title.length !== 1) fail(`expected the "Smart targets" title once, found ${title.length}`);

console.log('Will remove from the Smart targets card:');
for (const d of doomed) console.log('  - ' + (visible(d).slice(0, 110) || d.getText(sf).slice(0, 80)));
console.log('Will rename "Smart targets" to "Daily targets and hydration".');
console.log('Will add a pointer to Fuel at the top of the nutrition section.');

const edits = doomed.map(d => ({ start: d.getFullStart(), end: d.end, text: '' }));
const t = title[0];
edits.push({ start: t.getStart(sf), end: t.end, text: t.getText(sf).replace('Smart targets', 'Daily targets and hydration') });
const openEnd = ts.isJsxFragment(section) ? section.openingFragment.end : section.openingElement.end;
edits.push({ start: openEnd, end: openEnd, text: `\n            <div className="${MARK}">Today's intake, the last 7 days, your maintenance estimate and target lock are on <button type="button" onClick={() => setView('meals')}>Fuel</button>. This section keeps your daily targets, hydration, the advice, energy balance and the full log.</div>` });
edits.sort((a, b) => b.start - a.start);
for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);

// useApp() names: add setView, drop any nothing uses any more
sf = parse(src);
const pat = all(sf, n => ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === 'useApp' && ts.isObjectBindingPattern(n.name))[0];
if (!pat) fail('could not find the useApp() names in BodyView');
const names = pat.name.elements.map(e => e.getText(sf));
const rest = src.slice(0, pat.name.getStart(sf)) + src.slice(pat.name.end);
const kept = names.filter(n => !/^\w+$/.test(n) || new RegExp('\\b' + n + '\\b').test(rest));
const dropped = names.filter(n => !kept.includes(n));
if (!kept.includes('setView')) kept.push('setView');
src = src.slice(0, pat.name.getStart(sf)) + '{ ' + kept.join(', ') + ' }' + src.slice(pat.name.end);
console.log(dropped.length ? `No longer used, removed from useApp(): ${dropped.join(', ')}` : 'No useApp() names become unused.');

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }
writeFileSync(FILE, src);
console.log('\nBodyView updated. Next: npm run build');
