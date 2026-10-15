// Weight jumps and equipment (Settings > Tools and data). Set the real jump for each exercise (your
// stack's steps, the smallest plates you have), the kind of kit, and for plate-loaded lifts the bar or
// sled weight already included in what you log. The progression engine then adds your real jump, the
// workout steppers move by it, and plate-loaded lifts show plates per side.
import { useMemo, useState } from 'react';
import { ALL_EX } from '../data/programme';
import { getDefaultIncrement } from '../lib/training';
import { equipment, saveEquipment } from '../lib/equipment';
import { KINDS, guessKind } from '../lib/plates';
import type { EquipMap, Kind } from '../lib/plates';

const KIND_LABEL: Record<Kind, string> = { stack: 'Stack', plates: 'Plates', dumbbells: 'Dumbbells', bodyweight: 'Bodyweight' };

export default function EquipmentSettings() {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<EquipMap>(() => ({ ...equipment() }));
  const list = useMemo(() => {
    const raw: any[] = Array.isArray(ALL_EX) ? (ALL_EX as any[]) : Object.values(ALL_EX as any);
    const seen = new Set<string>();
    return raw.filter(e => e && typeof e.id === 'string' && typeof e.name === 'string' && !seen.has(e.id) && (seen.add(e.id), true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const set = (id: string, patch: Record<string, unknown>) => {
    const cur = { ...(m[id] || {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) delete cur[k]; else cur[k] = v; }
    const next: EquipMap = { ...m, [id]: cur as any };
    if (!Object.keys(cur).length) delete next[id];
    saveEquipment(next);
    setM({ ...equipment() });
  };
  const custom = Object.keys(m).length;

  return (
    <div className="ui-card eq2">
      <button type="button" className="eq2-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ui-eyebrow">Weight jumps and equipment</span>
        <span className="td2-meta">{custom ? custom + ' set' : 'using defaults'} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <div className="td2-meta">The jump is what the engine adds when you earn a weight increase, and what the workout steppers move by. For plates, "bar or sled" is the weight already counted in what you log (0 if you log plates only).</div>
          <div className="eq2-list">
            {list.map(ex => {
              const s = m[ex.id] || {};
              const kind: Kind = s.kind || guessKind(ex.name);
              const def = getDefaultIncrement(ex);
              return (
                <div key={ex.id} className="eq2-row">
                  <div className="eq2-name">{ex.name}</div>
                  <div className="eq2-fields">
                    <select aria-label={'Kit for ' + ex.name} value={kind} onChange={e => set(ex.id, { kind: e.target.value })}>
                      {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <label className="eq2-in"><span>Jump kg</span>
                      <input type="number" inputMode="decimal" step="0.25" placeholder={String(def)} value={s.inc ?? ''} onChange={e => set(ex.id, { inc: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
                    </label>
                    {kind === 'plates' && (
                      <label className="eq2-in"><span>Bar or sled kg</span>
                        <input type="number" inputMode="decimal" step="0.5" placeholder="0" value={s.base ?? ''} onChange={e => set(ex.id, { base: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="td2-meta">Saved on this device as you type. Blank means the default shown.</div>
        </>
      )}
    </div>
  );
}
