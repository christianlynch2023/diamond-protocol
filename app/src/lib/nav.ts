// Round 2 navigation: five tabs over the app's existing view names.
// The view names themselves don't change (other screens call setView('home'), setView('history') and so on),
// so this file only decides which tab each view belongs to and which chrome it shows.

export type TabId = 'today' | 'train' | 'progress' | 'body' | 'fuel';
export type NavIcon = 'today' | 'program' | 'progress' | 'body' | 'meals';

export interface TabDef {
  id: TabId;
  label: string;
  icon: NavIcon;
  /** View opened when the tab is tapped (Train remembers Plan or History separately). */
  home: string;
  /** Every view that counts as "inside" this tab. */
  views: readonly string[];
}

export const TABS: readonly TabDef[] = [
  { id: 'today', label: 'Today', icon: 'today', home: 'today', views: ['today'] },
  { id: 'train', label: 'Train', icon: 'program', home: 'home', views: ['home', 'history'] },
  { id: 'progress', label: 'Progress', icon: 'progress', home: 'progress', views: ['progress'] },
  { id: 'body', label: 'Body', icon: 'body', home: 'body', views: ['body'] },
  { id: 'fuel', label: 'Fuel', icon: 'meals', home: 'meals', views: ['meals'] },
];

/** Tools and Privacy now live behind the settings button. */
export const SETTINGS_VIEWS: readonly string[] = ['tools', 'privacy'];
/** Full-screen flows with no bottom bar. */
const NO_NAV: readonly string[] = ['workout', 'complete', ...SETTINGS_VIEWS];

export function tabFor(view: string): TabId | null {
  const t = TABS.find(x => x.views.includes(view));
  return t ? t.id : null;
}
export const isSettings = (view: string): boolean => SETTINGS_VIEWS.includes(view);
export const showsNav = (view: string): boolean => !NO_NAV.includes(view);
/** The settings button sits on the five tab screens only (not on session preview or workouts). */
export const showsSettingsButton = (view: string): boolean => tabFor(view) !== null;
