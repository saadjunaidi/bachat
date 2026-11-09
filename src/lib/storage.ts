import { migrate, type Data } from './types';

const KEY = 'bachat.v1';

export function loadData(): Data | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const d = JSON.parse(s);
    if (!d || !Array.isArray(d.txns)) return null;
    return migrate(d);
  } catch {
    return null;
  }
}

export function saveData(d: Data): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** Ask the browser not to clear our data under storage pressure (supported in Chrome, Edge, Firefox, Safari 17+). */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}
