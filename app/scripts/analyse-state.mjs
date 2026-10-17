#!/usr/bin/env node
// Maps state/useAppState.tsx before splitting it. Reads only; changes nothing. Run from app/:
//   node scripts/analyse-state.mjs            (summary)
//   node scripts/analyse-state.mjs --detail   (also lists each area's statements)
// For each area (workout, nutrition, body, WHOOP, sync, AI, settings, core): size, what it hands to
// screens, what it needs from other areas while rendering (the dependencies that decide where it can be
// cut out), and whether it can be lifted out as one block, with the blocking names if not.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const DETAIL = process.argv.includes('--detail');
const FILE = new URL('../src/state/useAppState.tsx', import.meta.url).pathname;
const src = readFileSync(FILE, 'utf8');
const sf = ts.createSourceFile('useAppState.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

let hook = null;
const findHook = (n) => { if (hook) return; if ((ts.isFunctionDeclaration(n) && n.name?.text === 'useAppState') || (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'useAppState')) hook = n; ts.forEachChild(n, findHook); };
findHook(sf);
if (!hook) { console.error('useAppState not found'); process.exit(1); }
const body = ts.isFunctionDeclaration(hook) ? hook.body : hook.initializer.body;
const stmts = body.statements;

// 1. what each statement declares, and its kind
const namesOf = (b) => ts.isIdentifier(b) ? [b.text] : (ts.isArrayBindingPattern(b) || ts.isObjectBindingPattern(b)) ? b.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : namesOf(e.name))) : [];
const calleeOf = (e) => { while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e))) e = e.expression; return e && ts.isCallExpression(e) ? e.expression.getText(sf).replace(/^React\./, '') : null; };
const info = stmts.map((s, i) => {
  let names = [], kind = 'other';
  if (ts.isVariableStatement(s)) {
    for (const d of s.declarationList.declarations) {
      names.push(...namesOf(d.name));
      const c = calleeOf(d.initializer);
      kind = c && /^(useState|usePersistentState|useMemo|useRef|useCallback|useReducer)$/.test(c) ? c
        : d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? 'function' : c ? 'call:' + c.slice(0, 20) : 'value';
    }
  } else if (ts.isFunctionDeclaration(s) && s.name) { names = [s.name.text]; kind = 'function'; }
  else if (ts.isExpressionStatement(s)) { const c = calleeOf(s.expression); kind = c ? c : 'expression'; }
  else if (ts.isReturnStatement(s)) kind = 'return';
  return { i, s, names, kind, line: line(s), bytes: s.end - s.getStart(sf) };
});
const declaredAt = new Map();
for (const x of info) for (const n of x.names) if (!declaredAt.has(n)) declaredAt.set(n, x.i);

// 2. references: render-time (evaluated while the hook runs) vs lazy (inside callbacks, effects, handlers)
const RENDER_CALLS = /^(useMemo|useState|usePersistentState|useRef|useReducer)$/;
for (const x of info) {
  const render = new Set(), lazy = new Set();
  const walk = (n, isLazy) => {
    if (ts.isIdentifier(n) && declaredAt.has(n.text) && !x.names.includes(n.text)) {
      const p = n.parent;
      const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
      if (!isProp) (isLazy ? lazy : render).add(n.text);
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) {
      const call = n.parent && ts.isCallExpression(n.parent) ? n.parent : null;
      const renderCb = call && RENDER_CALLS.test(call.expression.getText(sf).replace(/^React\./, '')) && call.arguments[0] === n;
      ts.forEachChild(n, c => walk(c, isLazy || !renderCb));
      return;
    }
    ts.forEachChild(n, c => walk(c, isLazy));
  };
  walk(x.s, false);
  x.render = [...render]; x.lazy = [...lazy];
}

// 3. areas, by the names each statement declares
const AREAS = [
  ['workout', /^(setData|wip|exIdx|curEx|curSet|curTarget|sess$|sel$|logSet|editIdx|timer|rest|skip|swap|subMap|intens|int[A-Z]|pain|finish|tryFinish|saveAndFinish|startWorkout|resume|goToExercise|loggedSets|effSets|prevHist|progRec|activeInts|condensed|dur$|baseEx|applySwap|doSkip|wt$|rp$|rir$|setWt|setRp|setRir|CIRC|dashOff|R$|beep|restFlash)/],
  ['whoop', /whoop|readiness|recovery(?!Week)|hrv|sleep|strain|skinTemp/i],
  ['nutrition', /nutri|nutrition|calStats|macro|meal|hydration|effTargets|activeTarget|targetLock|lockCals|acceptTarget|tdee|protSeries|^n[CPF]$|^nDate|setN[CPFD]|addNutrition|showAddNutri|showCalLog/i],
  ['body', /body|bwRate|bwAt|weight|measure|latestBySite|bp|^gl|glucose|blood|cardio|protocol|context|temp|wood|checkin|KEY_SITES|secOpen|toggleSec|editBody/i],
  ['sync', /sync|cloud|import|export|backup|applyBackup|clearAll|storage|pull|push/i],
  ['ai', /briefing|review|getBriefing|getReview|period|coach|summary/i],
  ['settings', /^(week|block|phase|goalPhase|effPhase|highVol|hvActive|deload|isDeload|cfg|touchCfg|config|userSetWeek|newBlock|startNewBlock|view|setView|mealTime|setMealTime|setWeek|setBlock|setGoalPhase|setHighVol)/],
];
// Classified by the state a statement holds (its first name), so setWeek sits with week, not with workout sets.
const areaOf = (names) => { const n = names[0] || ''; for (const [a, re] of AREAS) if (re.test(n)) return a; return 'core'; };
for (const x of info) x.area = x.kind === 'return' ? 'return' : x.names.length ? areaOf(x.names) : areaOf([...x.render, ...x.lazy].filter(n => !/^set[A-Z]/.test(n)));
const areaByName = new Map(); for (const x of info) for (const n of x.names) areaByName.set(n, x.area);

// 4. what screens get
const ret = info.find(x => x.kind === 'return');
const exported = new Set(ret && ret.s.expression && ts.isObjectLiteralExpression(ret.s.expression) ? ret.s.expression.properties.map(p => (p.name ? p.name.getText(sf) : '')).filter(Boolean) : []);

// 5. existing render-time uses before declaration (should be none in a working app)
const tdz = info.flatMap(x => x.render.filter(n => declaredAt.get(n) > x.i).map(n => `${n} (used line ${x.line}, declared later)`));

// 6. per area: size, exports, deps, and whether it can be lifted out as one block
const areas = [...new Set(info.map(x => x.area))].filter(a => a !== 'return');
console.log(`useAppState.tsx: ${(src.length / 1024).toFixed(0)} KB, ${stmts.length} top-level statements, ${declaredAt.size} names, ${exported.size} returned to screens`);
console.log(`Render-time uses before declaration: ${tdz.length ? tdz.length + '\n  ' + tdz.slice(0, 10).join('\n  ') : 'none'}\n`);
const rows = [];
for (const a of areas) {
  const xs = info.filter(x => x.area === a);
  const idx = xs.map(x => x.i);
  const first = Math.min(...idx), last = Math.max(...idx);
  const runs = idx.slice().sort((p, q) => p - q).reduce((r, v, k, arr) => r + (k === 0 || v !== arr[k - 1] + 1 ? 1 : 0), 0);
  const own = new Set(xs.flatMap(x => x.names));
  const needs = new Map();   // other-area names this area reads while rendering
  for (const x of xs) for (const n of x.render) if (!own.has(n)) needs.set(n, areaByName.get(n));
  const usedBy = new Map();  // other areas reading this area's names while rendering
  for (const x of info) if (x.area !== a && x.area !== 'return') for (const n of x.render) if (own.has(n)) usedBy.set(n, x.area);
  // Lifting the area out as one block placed at position P needs: every render-time need declared before P,
  // and every render-time use of its names by other areas after P.
  const earliest = Math.max(-1, ...[...needs.keys()].map(n => declaredAt.get(n)));
  const users = info.filter(x => x.area !== a && x.area !== 'return' && x.render.some(n => own.has(n)));
  const latest = Math.min(stmts.length, ...users.map(x => x.i));
  const blocked = earliest >= latest;
  const blockers = blocked ? [...needs.keys()].filter(n => declaredAt.get(n) >= latest).slice(0, 6) : [];
  rows.push({ a, n: xs.length, kb: (xs.reduce((s, x) => s + x.bytes, 0) / 1024).toFixed(1), exp: [...own].filter(n => exported.has(n)).length, runs, needs, usedBy, blocked, blockers, earliest, latest, first, last });
}
rows.sort((p, q) => Number(p.blocked) - Number(q.blocked) || p.needs.size - q.needs.size);
console.log('Area       Stmts   KB  To screens  Pieces  Needs from others (render)   Read by others (render)   Lift out as one block?');
for (const r of rows) {
  const needAreas = [...new Set(r.needs.values())].join(',') || '-';
  const usedAreas = [...new Set(r.usedBy.values())].join(',') || '-';
  console.log(`${r.a.padEnd(10)} ${String(r.n).padStart(5)} ${r.kb.padStart(5)} ${String(r.exp).padStart(10)} ${String(r.runs).padStart(7)}  ${(r.needs.size + ' names: ' + needAreas).padEnd(28)} ${(r.usedBy.size + ' names: ' + usedAreas).padEnd(25)} ${r.blocked ? 'blocked by ' + r.blockers.join(', ') : 'yes'}`);
}
console.log('\nPieces = how many separate runs of statements the area is spread across in the file (1 = already together).');
console.log('"Lift out" = a single call placed after everything it needs and before anything that needs it.');
if (DETAIL) for (const r of rows) {
  console.log(`\n== ${r.a}: needs ${[...r.needs.keys()].slice(0, 25).join(', ') || 'nothing'}`);
  console.log(`   read by others: ${[...r.usedBy.keys()].slice(0, 25).join(', ') || 'nothing'}`);
  for (const x of info.filter(y => y.area === r.a)) console.log(`   line ${String(x.line).padStart(5)}  ${x.kind.padEnd(18)} ${x.names.join(', ').slice(0, 70)}`);
}
