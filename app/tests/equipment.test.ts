// Your weight jump per exercise reaches the progression engine; the name-based guess stays the fallback.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultIncrement, getIncrement, setIncrementOverrides } from '../src/lib/training';
import { adoptEquipment, equipment, equipmentForSync, saveEquipment } from '../src/lib/equipment';

describe('equipment: weight jumps', () => {
  it('uses your jump for an exercise when set, and the old guess otherwise', () => {
    setIncrementOverrides({ 'eq-leg-press': 5 });
    assert.equal(getIncrement({ id: 'eq-leg-press', name: 'Leg Press' }), 5);
    assert.equal(getIncrement({ id: 'eq-curl', name: 'Cable Curl' }), getDefaultIncrement({ name: 'Cable Curl' }));
    assert.equal(getIncrement({ name: 'Leg Press' }), 2.5);
    setIncrementOverrides({});
  });
  it('ignores nonsense jumps', () => {
    setIncrementOverrides({ a: 0, b: -5, c: 999, d: Number.NaN });
    for (const id of ['a', 'b', 'c', 'd']) assert.equal(getIncrement({ id, name: 'Leg Press' }), 2.5);
    setIncrementOverrides({});
  });
});


describe('equipment: syncing between devices', () => {
  it('sends your settings, or nothing at all when there are none', () => {
    saveEquipment({});
    assert.equal(equipmentForSync(), undefined);
    saveEquipment({ 'eq-leg-press': { inc: 5, kind: 'plates', base: 30 } });
    assert.deepEqual(equipmentForSync(), { 'eq-leg-press': { inc: 5, kind: 'plates', base: 30 } });
  });
  it('never lets an empty or broken set from elsewhere wipe your settings', () => {
    saveEquipment({ 'eq-leg-press': { inc: 5 } });
    assert.equal(adoptEquipment({}), false);
    assert.equal(adoptEquipment(null), false);
    assert.equal(adoptEquipment({ junk: { inc: -3 } }), false);
    assert.deepEqual(equipment(), { 'eq-leg-press': { inc: 5 } });
  });
  it('adopts real settings from the cloud, a restore point or a backup, and the engine uses them', () => {
    assert.equal(adoptEquipment({ 'eq-hack': { inc: 2.5 }, 'eq-leg-press': { inc: 10 } }), true);
    assert.equal(getIncrement({ id: 'eq-leg-press', name: 'Leg Press' }), 10);
    saveEquipment({});
  });
});
