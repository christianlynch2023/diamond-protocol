// Health watch, using the 6 May 2026 Randox panel's actual figures and marker names.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bpStatus, healthWatch, retestDue, statusOf, WATCH } from '../src/lib/healthWatch';
import type { Panel } from '../src/lib/healthWatch';

const m = (k: string, disp: string, unit = '') => ({ k, disp, unit });
const may: Panel = { date: '2026-05-06', groups: [
  { g: 'Full blood count', m: [m('Haemoglobin', '177', 'g/l'), m('Haematocrit', '53.1', '%')] },
  { g: 'Lipids', m: [m('LDL Cholesterol', '3.34', 'mmol/l'), m('HDL Cholesterol', '1.53', 'mmol/l'), m('Total Cholesterol / HDL Cholesterol Ratio', '3.42'), m('Apolipoprotein B', '101', 'mg/dl')] },
  { g: 'Metabolic', m: [m('Glucose', '6.52', 'mmol/l'), m('HbA1c', '33.55', 'mmol/mol'), m('Glucose (Urine)', 'not detected')] },
  { g: 'Kidney', m: [m('Creatinine', '98'), m('Estimated Glomerular Filtration Rate (eGFR)', '83'), m('Cystatin C', '1.08', 'mg/l')] },
  { g: 'Liver', m: [m('Alanine Aminotransferase (ALT)', '35.5', 'U/l'), m('Aspartate Aminotransferase (AST)', '25.7', 'U/l'), m('Gamma-Glutamyltransferase (GGT)', '24', 'U/l')] },
  { g: 'Hormones', m: [m('Prolactin', '122', 'mIU/l'), m('Oestradiol', '102', 'pmol/l'), m('Testosterone', '35.2', 'nmol/l')] },
  { g: 'Prostate & vitamins', m: [m('Total Prostate Specific Antigen (TPSA)', '0.59', 'µg/l')] },
] };
const byId = (rows: ReturnType<typeof healthWatch>, id: string) => rows.find(r => r.def.id === id);

describe('health watch: reading your panels', () => {
  const rows = healthWatch([may]);
  it('finds every watched marker under Randox\u2019s names', () => {
    for (const r of rows) assert.ok(r.latest, `${r.def.name} found`);
  });
  it('reads your May figures and status correctly', () => {
    const want: Record<string, [number, string]> = { hct: [53.1, 'watch'], hb: [177, 'watch'], ldl: [3.34, 'watch'], hdl: [1.53, 'ok'], apob: [101, 'watch'], glu: [6.52, 'watch'], a1c: [33.55, 'ok'], cys: [1.08, 'watch'], egfr: [83, 'ok'], alt: [35.5, 'ok'], ast: [25.7, 'ok'], ggt: [24, 'ok'], prl: [122, 'ok'], e2: [102, 'ok'], psa: [0.59, 'ok'] };
    for (const [id, [v, st]] of Object.entries(want)) {
      const r = byId(rows, id);
      assert.equal(r?.latest?.value, v, id);
      assert.equal(r?.status, st, id);
    }
  });
  it('never mistakes urine glucose, a cholesterol ratio or free PSA for the real marker', () => {
    const extra: Panel = { date: '2026-06-01', groups: [{ g: 'x', m: [m('Glucose (Urine)', '5'), m('Free PSA', '9'), m('Free Prostate Specific Antigen', '9'), m('Total Cholesterol/HDL Ratio', '9')] }] };
    const r = healthWatch([may, extra]);
    assert.equal(byId(r, 'glu')?.latest?.date, '2026-05-06');
    assert.equal(byId(r, 'psa')?.latest?.value, 0.59);
    assert.equal(byId(r, 'hdl')?.latest?.value, 1.53);
  });
});

describe('health watch: other labs\u2019 units', () => {
  it('converts haematocrit as L/L, cholesterol and glucose in mg/dl, and HbA1c in %', () => {
    const us: Panel = { date: '2026-11-20', groups: [{ g: 'x', m: [m('HCT', '0.55', 'L/L'), m('LDL', '160', 'mg/dL'), m('Glucose', '110', 'mg/dL'), m('HbA1c', '6.5', '%'), m('Hemoglobin', '18.6', 'g/dL')] }] };
    const r = healthWatch([may, us]);
    assert.equal(byId(r, 'hct')?.latest?.value, 55);
    assert.equal(byId(r, 'hct')?.status, 'act');
    assert.equal(byId(r, 'ldl')?.latest?.value, 4.14);
    assert.equal(byId(r, 'glu')?.latest?.value, 6.11);
    assert.equal(byId(r, 'a1c')?.latest?.value, 47.54);
    assert.equal(byId(r, 'hb')?.latest?.value, 186);
  });
  it('shows the direction of travel against the previous panel', () => {
    const later: Panel = { date: '2026-11-20', groups: [{ g: 'x', m: [m('Haematocrit', '55.0', '%'), m('HDL Cholesterol', '0.85'), m('PSA', '0.6')] }] };
    const r = healthWatch([later, may]);
    assert.equal(byId(r, 'hct')?.trend, 'up');
    assert.equal(byId(r, 'hdl')?.trend, 'down');
    assert.equal(byId(r, 'hdl')?.status, 'act');
    assert.equal(byId(r, 'psa')?.trend, 'flat');
  });
});

describe('health watch: thresholds, blood pressure and retesting', () => {
  it('treats lower as worse where it should (HDL, eGFR)', () => {
    const hdl = WATCH.find(d => d.id === 'hdl'), egfr = WATCH.find(d => d.id === 'egfr');
    assert.ok(hdl && egfr);
    if (!hdl || !egfr) return;
    assert.deepEqual([statusOf(hdl, 1.5), statusOf(hdl, 1.1), statusOf(hdl, 0.8)], ['ok', 'watch', 'act']);
    assert.deepEqual([statusOf(egfr, 90), statusOf(egfr, 70), statusOf(egfr, 55)], ['ok', 'watch', 'act']);
  });
  it('grades your blood pressure average', () => {
    assert.deepEqual([bpStatus(124, 78), bpStatus(132, 80), bpStatus(128, 91), bpStatus(null, 80)], ['ok', 'watch', 'act', null]);
  });
  it('makes a retest due 3 months after a panel with markers to watch, else 6', () => {
    const rows = healthWatch([may]);
    const r = retestDue(rows, [may], '2026-10-16');
    assert.equal(r.due, '2026-08-06');
    assert.equal(r.overdue, true);
    const clean: Panel = { date: '2026-09-01', groups: [{ g: 'x', m: [m('Haematocrit', '48')] }] };
    const r2 = retestDue(healthWatch([clean]), [clean], '2026-10-16');
    assert.equal(r2.due, '2027-03-01');
    assert.equal(r2.overdue, false);
    assert.equal(retestDue([], [], '2026-10-16').overdue, true);
  });
});
