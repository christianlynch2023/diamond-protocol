#!/usr/bin/env node
// Moves Body's whole nutrition section onto Fuel, so all nutrition lives in one place. Run from app/:
//   node scripts/r2-move-nutrition.mjs --dry-run   (shows everything it would do; writes nothing)
//   node scripts/r2-move-nutrition.mjs             (applies it)
// What it does:
//  1. In Body's nutrition section, drops the target lock box (tl-box) and the maintenance line (nc-ctx):
//     Fuel already shows both. Renames "Smart targets" to "Daily targets and hydration".
//  2. Moves the rest of the section, code unchanged, into src/components/NutritionDetail.tsx, which loads
//     exactly the app-state values and imports the code uses.
//  3. Shows NutritionDetail on Fuel, under the maintenance card, as "Log, targets and hydration".
//  4. Replaces the section in Body with a one-line link to Fuel, and drops names Body no longer uses.
// If the moved code depends on anything it can't bring along safely, it stops and writes nothing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

const DRY = process.argv.includes('--dry-run');
const P = (f) => new URL('../src/' + f, import.meta.url).pathname;
const BODY = P('views/BodyView.tsx'), FUEL = P('views/MealsView.tsx'), OUT = P('components/NutritionDetail.tsx');
const fail = (m) => { console.error('\nStopped, nothing written: ' + m + '\nSend this output to Claude.'); process.exit(1); };
if (existsSync(OUT)) { console.log('Already applied (NutritionDetail.tsx exists). Nothing to do.'); process.exit(0); }

let body = readFileSync(BODY, 'utf8');
let fuel = readFileSync(FUEL, 'utf8');
const parse = (s, n = 'f.tsx') => ts.createSourceFile(n, s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const unwrap = (e) => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };
const all = (root, pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); ts.forEachChild(n, w); }; w(root); return out; };
const childOfJsx = (n) => { let x = n; while (x.parent && !ts.isJsxElement(x.parent) && !ts.isJsxFragment(x.parent)) x = x.parent; return x; };
let sf;
const visible = (node) => { const out = []; const w = (n) => { if (n.kind === ts.SyntaxKind.JsxText) out.push(n.getText(sf)); ts.forEachChild(n, w); }; w(node); return out.join(' ').replace(/\s+/g, ' ').trim(); };
const hasClass = (el, c) => {
  const open = ts.isJsxElement(el) ? el.openingElement : ts.isJsxSelfClosingElement(el) ? el : null;
  if (!open) return false;
  const a = open.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'className');
  if (!a || !a.initializer) return false;
  // A class counts when it is not part of a longer name: "nc" matches "nc", "x nc" and `nc ${y}`,
  // but not "nc-hd". Works for plain strings, expressions and templates alike.
  const t = a.initializer.getText(sf);
  let i = t.indexOf(c);
  while (i >= 0) {
    const before = i === 0 ? '' : t[i - 1], after = t[i + c.length] || '';
    const edge = (ch) => ch === '' || !/[A-Za-z0-9_-]/.test(ch);
    if (edge(before) && edge(after)) return true;
    i = t.indexOf(c, i + 1);
  }
  return false;
};
const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const sections = () => all(sf, n => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  && ts.isCallExpression(n.left) && n.left.expression.getText(sf) === 'secOpen' && n.left.arguments[0] && ts.isStringLiteral(n.left.arguments[0])
  && n.left.arguments[0].text === 'nutrition' && (() => { const r = unwrap(n.right); return !!r && (ts.isJsxFragment(r) || ts.isJsxElement(r)); })())
  .map(n => ({ expr: childOfJsx(n), frag: unwrap(n.right), line: lineOf(n) }));
// The Smart targets card: the smallest element holding both the "Smart targets" title and the target lock box.
const findCard = () => {
  const c = all(sf, n => ts.isJsxElement(n) && /smart\s+targets/i.test(visible(n)) && all(n, m => ts.isJsxElement(m) && hasClass(m, 'tl-box')).length > 0);
  return c.filter(n => !c.some(o => o !== n && o.getStart(sf) >= n.getStart(sf) && o.end <= n.end));
};
// The nutrition section is whichever secOpen('nutrition') && ... block contains that card.
const findSection = (card) => {
  const list = sections();
  const hit = list.filter(s => card.getStart(sf) >= s.frag.getStart(sf) && card.end <= s.frag.end);
  if (hit.length !== 1) fail(`the Smart targets card (line ${lineOf(card)}) sits in ${hit.length} nutrition sections; secOpen('nutrition') blocks found at lines ${list.map(s => s.line).join(', ') || 'none'}`);
  return hit[0];
};
const applyEdits = (s, edits) => { edits.sort((a, b) => b.start - a.start); for (const e of edits) s = s.slice(0, e.start) + e.text + s.slice(e.end); return s; };

// ---- 1. tidy the section before moving it ----
// Works whether or not option A was applied first: removes any target lock box, maintenance line and
// option A's "…are on Fuel" pointer (it would point at itself on Fuel), and renames "Smart targets" if present.
sf = parse(body);
const secList = sections();
if (secList.length !== 1) fail(`expected 1 nutrition section, found ${secList.length}${secList.length ? ' at lines ' + secList.map(x => x.line).join(', ') : ''}`);
let sec = secList[0];
const pieces = (cls) => [...new Set(all(sec.frag, n => ts.isJsxElement(n) && hasClass(n, cls)).map(childOfJsx))];
const dupes = [...new Set([...pieces('tl-box'), ...pieces('nc-ctx')])];
for (const d of dupes) if (/hydration|electrolyte|Eat today|nc-adj/i.test(d.getText(sf))) fail('a lock box or maintenance line also contains targets, hydration or advice');
const pointers = pieces('bn2-fuel');
if (pointers.length > 1) fail(`expected at most 1 Fuel pointer in the section, found ${pointers.length}`);
const tEdits = [...dupes, ...pointers].map(d => ({ start: d.getFullStart(), end: d.end, text: '' }));
const title = all(sec.frag, n => n.kind === ts.SyntaxKind.JsxText && /^\s*Smart targets\s*$/.test(n.getText(sf)));
for (const t of title) tEdits.push({ start: t.getStart(sf), end: t.end, text: t.getText(sf).replace('Smart targets', 'Daily targets and hydration') });
console.log(`Found: nutrition section at line ${sec.line}.`);
console.log(`  Tidying first: ${dupes.length} lock box / maintenance piece(s), ${pointers.length} old Fuel pointer, ${title.length} title rename.`);
body = applyEdits(body, tEdits);

// ---- 2. what the section depends on ----
sf = parse(body);
{ const list = sections(); const near = list.filter(x => Math.abs(x.line - sec.line) <= 2); if (near.length !== 1) fail('lost track of the nutrition section after trimming'); sec = near[0]; }
const frag = sec.frag;
const inner = ts.isJsxFragment(frag) ? body.slice(frag.openingFragment.end, frag.closingFragment.getStart(sf)) : body.slice(frag.openingElement.end, frag.closingElement.getStart(sf));
const declared = new Set();
all(frag, n => (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name)).forEach(n => declared.add(n.name.text));
const refs = new Set();
all(frag, n => ts.isIdentifier(n)).forEach(id => {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === id) return;
  if (ts.isJsxAttribute(p) && p.name === id) return;
  if ((ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === id && /^[a-z]/.test(id.text)) return;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return;
  if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return;
  refs.add(id.text);
});
const GLOBALS = new Set('Math Number Date String Object Array JSON parseFloat parseInt isNaN isFinite window document console undefined NaN Infinity Set Map Boolean Promise setTimeout clearTimeout encodeURIComponent Intl RegExp Error alert confirm localStorage sessionStorage navigator URL Blob FileReader crypto structuredClone globalThis requestAnimationFrame React true false null this'.split(' '));
const free = [...refs].filter(n => !declared.has(n) && !GLOBALS.has(n)).sort();

const pat = all(sf, n => ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === 'useApp' && ts.isObjectBindingPattern(n.name))[0];
if (!pat) fail("could not find Body's useApp() names");
const appNames = new Set(pat.name.elements.map(e => e.name.getText(sf)));
const imports = [];
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause) continue;
  const from = st.moduleSpecifier.text, c = st.importClause;
  if (c.name) imports.push({ name: c.name.text, from, kind: 'default' });
  if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) imports.push({ name: e.name.text, imported: e.propertyName ? e.propertyName.text : e.name.text, from, kind: 'named', typeOnly: c.isTypeOnly || e.isTypeOnly });
}
const importNames = new Map(imports.map(i => [i.name, i]));
const useAppNeeded = free.filter(n => appNames.has(n));
const importNeeded = free.filter(n => !appNames.has(n) && importNames.has(n));
const unresolved = free.filter(n => !appNames.has(n) && !importNames.has(n));

console.log(`Moving Body's nutrition section to Fuel (${inner.length.toLocaleString()} characters of code).`);
console.log(`  App-state values it uses (${useAppNeeded.length}): ${useAppNeeded.join(', ')}`);
console.log(`  Imports it needs (${importNeeded.length}): ${importNeeded.join(', ') || 'none'}`);
if (unresolved.length) fail(`the section uses things defined only inside Body: ${unresolved.join(', ')}`);

// ---- 3. NutritionDetail.tsx ----
const byFrom = new Map();
for (const n of importNeeded) { const i = importNames.get(n); const from = i.from.startsWith('./') ? '../views/' + i.from.slice(2) : i.from; if (!byFrom.has(from)) byFrom.set(from, []); byFrom.get(from).push(i); }
const importLines = [...byFrom].map(([from, list]) => {
  const def = list.find(i => i.kind === 'default');
  const named = list.filter(i => i.kind === 'named').map(i => (i.imported !== i.name ? `${i.imported} as ${i.name}` : i.name));
  return `import ${def ? def.name + (named.length ? ', ' : '') : ''}${named.length ? '{ ' + named.join(', ') + ' }' : ''} from '${from}';`;
});
const comp = `// Nutrition detail: moved from Body to Fuel (round 2 follow-up) so all nutrition lives in one place.
// The code below is Body's former nutrition section, unchanged apart from dropping the target lock box and
// maintenance line (both shown at the top of Fuel) and renaming "Smart targets".
import React from 'react';
import { useApp } from '../appContext';
${importLines.join('\n')}

export default function NutritionDetail() {
  const { ${useAppNeeded.join(', ')} } = useApp();
  return (
    <div className="nd2">${inner}</div>
  );
}
`;

// ---- 4. Body: replace the section (and its header) with a link to Fuel ----
const heads = all(sf, n => ts.isJsxElement(n) && hasClass(n, 'sec-head') && /toggleSec\(\s*['"]nutrition['"]\s*\)/.test(n.openingElement.getText(sf)));
if (heads.length !== 1) fail(`expected 1 nutrition section header in Body, found ${heads.length}`);
const head = childOfJsx(heads[0]), blk = sec.expr;
const link = `<div className="bn2-fuel">Nutrition and hydration are on <button type="button" onClick={() => setView('meals')}>Fuel</button>: intake, targets, hydration, advice and the full log.</div>`;
body = applyEdits(body, [{ start: head.getStart(sf), end: head.end, text: link }, { start: blk.getFullStart(), end: blk.end, text: '' }]);
sf = parse(body);
const pat2 = all(sf, n => ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === 'useApp' && ts.isObjectBindingPattern(n.name))[0];
const names = pat2.name.elements.map(e => e.getText(sf));
const rest = (body.slice(0, pat2.name.getStart(sf)) + body.slice(pat2.name.end)).replace(link, ''); // the link's wording isn't code
const used = (n) => new RegExp('\\b' + n + '\\b').test(rest);
const keptNames = names.filter(n => !/^\w+$/.test(n) || used(n));
const droppedNames = names.filter(n => !keptNames.includes(n));
if (!keptNames.includes('setView')) keptNames.push('setView');
body = body.slice(0, pat2.name.getStart(sf)) + '{ ' + keptNames.join(', ') + ' }' + body.slice(pat2.name.end);
// unused named imports in Body
sf = parse(body);
const iEdits = [];
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause || !st.importClause.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
  const restOfFile = body.slice(0, st.getStart(sf)) + body.slice(st.end);
  const keepEls = st.importClause.namedBindings.elements.filter(e => new RegExp('\\b' + e.name.text + '\\b').test(restOfFile));
  if (keepEls.length === st.importClause.namedBindings.elements.length) continue;
  const def = st.importClause.name ? st.importClause.name.text : null;
  if (!keepEls.length && !def) { iEdits.push({ start: st.getFullStart(), end: st.end, text: '' }); continue; }
  const txt = `import ${def ? def + (keepEls.length ? ', ' : '') : ''}${keepEls.length ? '{ ' + keepEls.map(e => e.getText(sf)).join(', ') + ' }' : ''} from '${st.moduleSpecifier.text}';`;
  iEdits.push({ start: st.getStart(sf), end: st.end, text: txt });
}
body = applyEdits(body, iEdits);
console.log(`  Body: section replaced by a link to Fuel; ${droppedNames.length} app-state names and ${iEdits.length} import line(s) tidied.`);

// ---- 5. Fuel: show it under the maintenance card ----
const marker = '<span className="hm-ttl">Where you are</span>';
const mi = fuel.indexOf(marker);
if (mi < 0 || fuel.indexOf(marker, mi + 1) >= 0) fail('could not find exactly one "Where you are" card on Fuel to insert before');
const at = fuel.lastIndexOf('<div className="ar-card">', mi);
if (at < 0) fail('could not find the start of the "Where you are" card on Fuel');
const lineStart = fuel.lastIndexOf('\n', at) + 1;
fuel = fuel.slice(0, lineStart) + `          <div className="nd2-head"><span className="hm-ttl">Log, targets and hydration</span></div>\n          <NutritionDetail />\n\n` + fuel.slice(lineStart);
const imp = "import { Button, Card, Eyebrow, Segmented } from '../components/ui';";
if (!fuel.includes(imp)) fail('could not find the ui import line on Fuel');
fuel = fuel.replace(imp, imp + "\nimport NutritionDetail from '../components/NutritionDetail';");
console.log('  Fuel: "Log, targets and hydration" added under the maintenance card.');

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }
writeFileSync(OUT, comp);
writeFileSync(BODY, body);
writeFileSync(FUEL, fuel);
console.log('\nDone: NutritionDetail.tsx created, Body and Fuel updated. Next: npm run build');
