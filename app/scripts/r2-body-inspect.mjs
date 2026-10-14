#!/usr/bin/env node
// Prints the inside of Body's "Smart targets" card in full: every part, nested, with its class name,
// the condition it shows under, and all its visible text. Writes nothing. Run from app/:
//   node scripts/r2-body-inspect.mjs
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const FILE = new URL('../src/views/BodyView.tsx', import.meta.url).pathname;
const src = readFileSync(FILE, 'utf8');
const sf = ts.createSourceFile('BodyView.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const unwrap = (e) => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };
const visible = (node) => { const out = []; const walk = (n) => { if (n.kind === ts.SyntaxKind.JsxText) out.push(n.getText(sf)); ts.forEachChild(n, walk); }; walk(node); return out.join(' ').replace(/\s+/g, ' ').trim(); };
const cls = (el) => {
  const open = ts.isJsxElement(el) ? el.openingElement : ts.isJsxSelfClosingElement(el) ? el : null;
  if (!open) return '';
  const a = open.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'className');
  return a && a.initializer ? a.initializer.getText(sf).replace(/^["'{]|["'}]$/g, '').slice(0, 40) : '';
};
// Peel `{cond && <el/>}` / `{cond ? <a/> : <b/>}` into the condition and the element(s)
const parts = (n) => {
  if (ts.isJsxExpression(n)) {
    let e = unwrap(n.expression), cond = '';
    if (e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { cond = e.left.getText(sf); e = unwrap(e.right); }
    if (e && ts.isConditionalExpression(e)) return [{ cond: (cond ? cond + ' && ' : '') + e.condition.getText(sf) + ' ?', el: unwrap(e.whenTrue) }, { cond: 'else', el: unwrap(e.whenFalse) }];
    return [{ cond, el: e }];
  }
  return [{ cond: '', el: n }];
};
const kidsOf = (el) => (el && (ts.isJsxElement(el) || ts.isJsxFragment(el))) ? el.children.filter(c => !(ts.isJsxText(c) && !c.getText(sf).trim())) : [];

let card = null;
const find = (n) => { if (card) return; if (ts.isJsxElement(n) && /\bnc\b/.test(cls(n)) && /Smart targets/i.test(visible(n))) card = n; ts.forEachChild(n, find); };
find(sf);
if (!card) { console.log('Smart targets card not found.'); process.exit(1); }
const line = sf.getLineAndCharacterOfPosition(card.getStart(sf)).line + 1;
console.log(`Smart targets card, BodyView.tsx line ${line}\n`);
const show = (n, depth) => {
  for (const { cond, el } of parts(n)) {
    if (!el) continue;
    const pad = '  '.repeat(depth);
    const c = cls(el);
    const text = (el.kind === ts.SyntaxKind.JsxText ? el.getText(sf) : visible(el)).replace(/\s+/g, ' ').trim();
    console.log(`${pad}- ${c ? '[' + c + '] ' : ''}${cond ? '(when ' + cond.replace(/\s+/g, ' ').slice(0, 70) + ') ' : ''}${text.slice(0, 220)}`);
    if (depth < 5) kidsOf(el).forEach(k => show(k, depth + 1));
  }
};
kidsOf(card).forEach(k => show(k, 0));
