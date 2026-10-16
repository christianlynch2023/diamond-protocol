// Loads and saves your equipment settings (Settings > Tools and data > Weight jumps and equipment) and
// hands the weight jumps to the progression engine. Kept on this device under dp_equipment, and carried
// in the synced config, so cloud sync, restore points and backup files include it.
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

// Sync rules. An empty set is never sent and never adopted: a device with nothing set (a new phone, or the
// Test site, which shares your cloud data but not your settings) must not wipe settings made elsewhere.
/** What goes into the synced config: your settings, or nothing if there are none. */
export function equipmentForSync(): EquipMap | undefined {
  return Object.keys(current).length ? current : undefined;
}
/** Adopt settings arriving from the cloud, a restore point or a backup file. Returns true if applied. */
export function adoptEquipment(incoming: unknown): boolean {
  const m = sanitize(incoming);
  if (!Object.keys(m).length) return false;
  saveEquipment(m);
  return true;
}
