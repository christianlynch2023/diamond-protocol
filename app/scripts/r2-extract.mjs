#!/usr/bin/env node
// Splitting the app-state file: moves one area out of state/useAppState.tsx into its own hook. Run from app/:
//   node scripts/r2-extract.mjs --area sync --dry-run   (lists exactly what moves and where; writes nothing)
//   node scripts/r2-extract.mjs --area sync             (applies it)
// The area's statements move unchanged into state/use<Area>.tsx; screens see the same names as before.
// Every name the moved code uses is resolved by the TypeScript compiler: local, imported (import copied),
// or declared elsewhere in the hook (handed over). The new hook is called in the one slot where it is safe:
// after everything the area reads while rendering, and before the first other code that reads the area
// while rendering. Names the area only uses inside handlers but which are declared after that slot are
// handed over as live links (ctx.name, read when the handler runs), so nothing is used before it exists.
// Stops without writing if there is no safe slot, a statement mixes areas, the moved code reassigns a hook
// variable, or any value can't be resolved. Safe to run twice.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const AREA = (args[args.indexOf('--area') + 1] || '').toLowerCase();
const fail = (m) => { console.error('\nStopped, nothing written: ' + m + '\nSend this output to Claude.'); process.exit(1); };
const AREAS = [
  ['workout', /^(setData|wip|exIdx|curEx|curSet|curTarget|sess$|sel$|logSet|editIdx|timer|rest|skip|swap|subMap|intens|int[A-Z]|pain|finish|tryFinish|saveAndFinish|startWorkout|resume|goToExercise|loggedSets|effSets|prevHist|progRec|activeInts|condensed|dur$|baseEx|applySwap|doSkip|wt$|rp$|rir$|CIRC|dashOff|R$|beep|restFlash)/],
  ['whoop', /whoop|readiness|recovery(?!Week)|hrv|sleep|strain|skinTemp/i],
  ['nutrition', /nutri|nutrition|calStats|macro|meal|hydration|effTargets|activeTarget|targetLock|lockCals|acceptTarget|tdee|protSeries|^n[CPF]$|^nDate|addNutrition|showAddNutri|showCalLog/i],
  ['body', /body|bwRate|bwAt|weight|measure|latestBySite|bp|^gl|glucose|blood|cardio|protocol|context|temp|wood|checkin|KEY_SITES|secOpen|toggleSec|editBody/i],
  ['sync', /sync|cloud|import|export|backup|applyBackup|clearAll|storage|pull|push/i],
  ['ai', /briefing|review|getBriefing|getReview|period|coach|summary/i],
  ['settings', /^(week|block|phase|goalPhase|effPhase|highVol|hvActive|deload|isDeload|cfg|touchCfg|config|userSetWeek|newBlock|startNewBlock|view|mealTime)/],
];
const AREA_RE = AREAS.find(([a]) => a === AREA);
if (!AREA_RE) fail(`--area must be one of: ${AREAS.map(([a]) => a).join(', ')}`);
const Name = AREA.charAt(0).toUpperCase() + AREA.slice(1);
const FILE = new URL('../src/state/useAppState.tsx', import.meta.url).pathname;
const OUT = new URL(`../src/state/use${Name}.tsx`, import.meta.url).pathname;
if (existsSync(OUT)) { console.log(`Already applied (state/use${Name}.tsx exists). Nothing to do.`); process.exit(0); }

const src = readFileSync(FILE, 'utf8');
const program = ts.createProgram([FILE], { jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(FILE);
const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const all = (root, pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); ts.forEachChild(n, w); }; w(root); return out; };
const hook = all(sf, n => ts.isFunctionDeclaration(n) && n.name && n.name.text === 'useAppState')[0];
if (!hook || !hook.body) fail('useAppState not found');
const stmts = [...hook.body.statements];
const ret = stmts[stmts.length - 1];
if (!ts.isReturnStatement(ret)) fail('useAppState does not end with its return statement');
const namesOf = (b) => ts.isIdentifier(b) ? [b.text] : (ts.isArrayBindingPattern(b) || ts.isObjectBindingPattern(b)) ? b.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : namesOf(e.name))) : [];
const declOf = (s) => ts.isVariableStatement(s) ? s.declarationList.declarations.flatMap(d => namesOf(d.name)) : ts.isFunctionDeclaration(s) && s.name ? [s.name.text] : [];
const indexOfStmt = new Map(stmts.map((s, i) => [s, i]));
const hookStmtOf = (node) => { let x = node; while (x && x.parent !== hook.body) x = x.parent; return x; };

// 1. the area's statements: declarations whose state (first name) belongs to the area
const moved = stmts.filter(s => { const d = declOf(s); return d.length && AREA_RE[1].test(d[0]); });
if (!moved.length) fail(`no statements found for area ${AREA}`);
const movedSet = new Set(moved);
const MOVE = moved.flatMap(declOf);
const inMoved = (node) => { let x = node; while (x && x !== hook.body) { if (movedSet.has(x)) return true; x = x.parent; } return false; };

// render-time vs lazy: inside callbacks other than useMemo/useState/useRef initialisers is lazy
const RENDER_CALLS = /^(useMemo|useState|usePersistentState|useRef|useReducer)$/;
const isLazy = (id, stop) => {
  let x = id.parent;
  while (x && x !== stop) {
    if (ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isFunctionDeclaration(x)) {
      const call = x.parent && ts.isCallExpression(x.parent) ? x.parent : null;
      const renderCb = call && RENDER_CALLS.test(call.expression.getText(sf).replace(/^React\./, '')) && call.arguments[0] === x;
      if (!renderCb) return true;
    }
    x = x.parent;
  }
  return false;
};
const isNameSite = (id) => { const p = id.parent; return (ts.isPropertyAccessExpression(p) && p.name === id) || (ts.isPropertyAssignment(p) && p.name === id) || (ts.isJsxAttribute(p) && p.name === id) || (ts.isBindingElement(p) && p.propertyName === id); };

// 2. resolve every identifier in the moved code
const GLOBALS = /^(undefined|NaN|Infinity|globalThis|window|document|console|Math|JSON|Date|Number|String|Object|Array|Promise|Set|Map|fetch|alert|confirm|localStorage|sessionStorage|navigator|setTimeout|clearTimeout|setInterval|clearInterval|encodeURIComponent|decodeURIComponent|parseFloat|parseInt|isNaN|isFinite|Boolean|Error|RegExp|Intl|Symbol|structuredClone|crypto|URL|Blob|File|FileReader|arguments|location|history|requestAnimationFrame|atob|btoa|TextEncoder|TextDecoder|AbortController|Response|Request|Headers|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array|ArrayBuffer|DataView|BigInt|WeakMap|WeakSet|Proxy|Reflect|queueMicrotask|performance|matchMedia|getComputedStyle|FormData|Event|CustomEvent|Notification|Image|Audio|AudioContext|webkitAudioContext|screen|open|prompt|caches|indexedDB|MessageChannel|BroadcastChannel|ResizeObserver|IntersectionObserver|MutationObserver|HTMLElement|HTMLInputElement|Element|Node|URLSearchParams)$/;
const ext = new Map();          // hook-level name -> { idx, uses: [{ id, lazy }] }
const importNames = new Map(), unresolved = new Set(), reassigned = new Set();
for (const s of moved) for (const id of all(s, n => ts.isIdentifier(n))) {
  if (isNameSite(id)) continue;
  const p = id.parent;
  // In a shorthand like { nutrition }, the name is both the property and the variable: ask for the variable.
  const sym = ts.isShorthandPropertyAssignment(p) && p.name === id ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(id);
  const inType = (() => { let x = id.parent; while (x && !movedSet.has(x)) { if (ts.isTypeNode(x)) return true; x = x.parent; } return false; })();
  if (!sym || !sym.declarations || !sym.declarations.length) { if (!inType && !GLOBALS.test(id.text)) unresolved.add(id.text); continue; }
  const decl = sym.declarations[0];
  if (ts.isImportSpecifier(decl) || ts.isImportClause(decl) || ts.isNamespaceImport(decl)) { importNames.set(id.text, decl); continue; }
  if (decl.getSourceFile() !== sf || inMoved(decl)) continue;
  const owner = hookStmtOf(decl);
  if (!owner || owner.parent !== hook.body) continue;
  if (inType) continue;
  if (ts.isBinaryExpression(p) && p.left === id && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) reassigned.add(id.text);
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) reassigned.add(id.text);
  const e = ext.get(id.text) || { idx: indexOfStmt.get(owner), uses: [] };
  e.uses.push({ id, lazy: isLazy(id, hookStmtOf(id)) });
  ext.set(id.text, e);
}
if (reassigned.size) fail('the moved code reassigns hook variables: ' + [...reassigned].join(', '));
if (unresolved.size) fail('names the compiler could not resolve: ' + [...unresolved].join(', '));

// 3. the safe slot
const renderNeeds = [...ext].filter(([, e]) => e.uses.some(u => !u.lazy));
const pMin = Math.max(-1, ...renderNeeds.map(([, e]) => e.idx));
const readers = [];
for (const s of stmts) {
  if (movedSet.has(s) || s === ret) continue;
  for (const id of all(s, n => ts.isIdentifier(n) && MOVE.includes(n.text))) {
    if (isNameSite(id) || isLazy(id, s)) continue;
    const sym = checker.getSymbolAtLocation(id);
    if (sym && sym.declarations && sym.declarations[0] && inMoved(sym.declarations[0])) readers.push({ s, name: id.text });
  }
}
const pMax = Math.min(stmts.length - 1, ...readers.map(r => indexOfStmt.get(r.s)));
const lastMovedNeedingOrder = pMin;
if (pMin >= pMax) {
  const blockers = renderNeeds.filter(([, e]) => e.idx >= pMax).map(([n, e]) => `${n} (line ${line(stmts[e.idx])})`);
  fail(`no safe slot: the area reads ${blockers.join(', ')} while rendering, but other code reads the area earlier, at line ${line(stmts[pMax])}`);
}
const slot = pMax;      // insert just before this statement: as late as possible, so fewer live links
const early = [...ext].filter(([, e]) => e.idx < slot).map(([n]) => n).sort();
const late = [...ext].filter(([, e]) => e.idx >= slot).map(([n]) => n).sort();
const lateRender = late.filter(n => ext.get(n).uses.some(u => !u.lazy));
if (lateRender.length) fail('internal check failed: names declared after the slot are read while rendering: ' + lateRender.join(', '));

// 4. build the new hook
const byModule = new Map();
for (const [name, decl] of importNames) {
  const imp = (() => { let x = decl; while (x && !ts.isImportDeclaration(x)) x = x.parent; return x; })();
  const from = imp.moduleSpecifier.text;
  const typeOnly = !!(imp.importClause && imp.importClause.isTypeOnly) || (ts.isImportSpecifier(decl) && decl.isTypeOnly);
  const key = (typeOnly ? 'type:' : '') + from;
  if (!byModule.has(key)) byModule.set(key, { def: null, named: [], ns: null, from, typeOnly });
  const m = byModule.get(key);
  if (ts.isImportClause(decl)) m.def = name; else if (ts.isNamespaceImport(decl)) m.ns = name;
  else m.named.push(decl.propertyName ? `${decl.propertyName.text} as ${name}` : name);
}
const importLines = [...byModule.values()].map(m => m.ns ? `import ${m.typeOnly ? 'type ' : ''}* as ${m.ns} from '${m.from}';`
  : `import ${m.typeOnly ? 'type ' : ''}${m.def ? m.def + (m.named.length ? ', ' : '') : ''}${m.named.length ? '{ ' + [...new Set(m.named)].sort().join(', ') + ' }' : ''} from '${m.from}';`);
// moved text, with late names turned into live links (ctx.name)
const lateUses = late.flatMap(n => ext.get(n).uses.map(u => u.id));
const pieces = moved.map(s => {
  const start = s.getFullStart(), end = s.end;
  const edits = lateUses.filter(id => id.getStart(sf) >= start && id.end <= end).map(id => ({
    a: id.getStart(sf) - start, b: id.end - start,
    t: ts.isShorthandPropertyAssignment(id.parent) ? `${id.text}: ctx.${id.text}` : `ctx.${id.text}`,
  })).sort((x, y) => y.a - x.a);
  let txt = src.slice(start, end);
  for (const e of edits) txt = txt.slice(0, e.a) + e.t + txt.slice(e.b);
  return txt.replace(/^\n+/, '');
});
const out = `// ${Name}: split out of useAppState. The statements below are moved unchanged, apart from names declared
// later in useAppState, which are read through \`ctx\` when a handler runs (live links). useAppState returns the
// same names to screens as before.
${importLines.join('\n')}

export function use${Name}(ctx: any) {
${early.length ? `  const { ${early.join(', ')} } = ctx;\n` : ''}${pieces.join('\n')}

  return { ${MOVE.join(', ')} };
}
`;
const ctxArg = [...early, ...late.map(n => `get ${n}() { return ${n}; }`)].join(', ');
const call = `// ${Name} (state/use${Name}.tsx). Placed after everything it reads while rendering and before the first code that reads it.\n  const { ${MOVE.join(', ')} } = use${Name}({ ${ctxArg} });\n\n  `;
const slotStmt = stmts[slot];
const edits = moved.map(s => ({ start: s.getFullStart(), end: s.end, text: '' }));
edits.push({ start: slotStmt.getStart(sf), end: slotStmt.getStart(sf), text: call });
const lastImport = [...sf.statements].filter(s => ts.isImportDeclaration(s)).pop();
edits.push({ start: lastImport.end, end: lastImport.end, text: `\nimport { use${Name} } from './use${Name}';` });
edits.sort((a, b) => b.start - a.start);
let next = src;
for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end);

console.log(`Area ${AREA}: moving ${moved.length} statements (${(moved.reduce((n, s) => n + s.end - s.getStart(sf), 0) / 1024).toFixed(1)} KB) to state/use${Name}.tsx`);
for (const s of moved) console.log(`  line ${String(line(s)).padStart(5)}  ${declOf(s).join(', ').slice(0, 90)}`);
console.log(`Placed before line ${line(slotStmt)}${readers.length ? ` (first code reading it while rendering: ${readers.filter(r => indexOfStmt.get(r.s) === pMax).map(r => r.name).join(', ')})` : ' (nothing reads it while rendering, so last)'}; after line ${pMin >= 0 ? line(stmts[pMin]) : 'start'} (last thing it reads while rendering).`);
console.log(`Handed over as values (${early.length}): ${early.join(', ') || 'none'}`);
console.log(`Handed over as live links (${late.length}, only read inside handlers): ${late.join(', ') || 'none'}`);
console.log(`Imports copied: ${importLines.length ? importLines.map(l => l.replace(/^import /, '').replace(/;$/, '')).join(' | ') : 'none'}`);
console.log(`useAppState: ${(src.length / 1024).toFixed(0)} KB -> ${(next.length / 1024).toFixed(0)} KB`);
if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }
writeFileSync(OUT, out);
writeFileSync(FILE, next);
console.log('\nDone. Next: npm run build && npm run test:e2e');
