// Loads and saves your equipment settings (Settings > Tools and data > Weight jumps and equipment) and
// hands the weight jumps to the progression engine. Stored on this device under dp_equipment.
import { LS } from './storage';
import { setIncrementOverrides } from './training';
import { incOverrides, sanitize } from './plates';
import type { EquipMap, EquipSetting } from './plates';

export const EQUIP_KEY = 'dp_equipment';
let current: EquipMap = {};

export function loadEquipment(): EquipMap {
  current = sanitize(LS.getJSON<unknown>(EQUIP_KEY, {}));
  setIncrementOverrides(incOverrides(current));
  return current;
}
export function saveEquipment(m: EquipMap): boolean {
  current = sanitize(m);
  setIncrementOverrides(incOverrides(current));
  return LS.set(EQUIP_KEY, JSON.stringify(current));
}
export const equipment = (): EquipMap => current;
export const equipmentFor = (id: string | null | undefined): EquipSetting => (id && current[id]) || {};
