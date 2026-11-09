import { blank, DEFAULT_SETTINGS, type Data } from './types';
import { iso } from './format';

export interface Backup { app: 'bachat'; v: number; at: string; state: Omit<Data, 'sample' | 'lastBackup'> }

function b64(u8: Uint8Array) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}
function unb64(s: string) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** Text backup: "BACHAT1:" + base64(gzip(json)). Falls back to uncompressed "BACHAT0:" on old browsers. */
export async function makeBackup(d: Data): Promise<string> {
  const payload: Backup = { app: 'bachat', v: 1, at: new Date().toISOString(), state: { accounts: d.accounts, txns: d.txns, rules: d.rules, overrides: d.overrides, goals: d.goals, mappings: d.mappings, settings: d.settings } };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return 'BACHAT1:' + b64(new Uint8Array(await new Response(st).arrayBuffer()));
  }
  return 'BACHAT0:' + b64(bytes);
}

export async function readBackup(text: string): Promise<Backup> {
  const code = String(text).replace(/\s+/g, '');
  const m = code.match(/^BACHAT([01]):([A-Za-z0-9+/=]+)$/);
  let j: Backup;
  try {
    if (m) {
      let bytes = unb64(m[2]);
      if (m[1] === '1') {
        if (typeof DecompressionStream === 'undefined') throw new Error('old');
        const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(st).arrayBuffer());
      }
      j = JSON.parse(new TextDecoder().decode(bytes));
    } else if (/^\{/.test(code)) j = JSON.parse(String(text));
    else throw new Error('format');
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'old') throw new Error('This browser is too old to open the backup. Update it or use Chrome, Safari or Firefox.');
    if (msg === 'format') throw new Error("That doesn't look like a Bachat backup. Copy the whole code, starting with BACHAT.");
    throw new Error('This backup is incomplete or damaged. Copy it again from the other device, making sure nothing is cut off.');
  }
  if (!j || j.app !== 'bachat' || !j.state || !Array.isArray(j.state.txns)) throw new Error("That doesn't look like a Bachat backup.");
  return j;
}

export function restoreData(b: Backup): Data {
  const st = b.state;
  return { ...blank(), ...st, settings: { ...DEFAULT_SETTINGS, ...(st.settings || {}) }, sample: false, lastBackup: b.at };
}

/** Adds a backup to existing data without duplicating transactions or goals. */
export function mergeData(cur: Data, b: Backup): { data: Data; added: number } {
  const base: Data = cur.sample ? { ...blank(), settings: cur.settings } : cur;
  const st = b.state;
  const have = new Set(base.txns.map((t) => t.id));
  const txns = base.txns.slice();
  let added = 0;
  for (const t of st.txns) if (!have.has(t.id)) { txns.push(t); have.add(t.id); added++; }
  const gid = new Set(base.goals.map((g) => g.id));
  const goals = base.goals.concat((st.goals || []).filter((g) => !gid.has(g.id)));
  return {
    added,
    data: {
      ...base,
      txns,
      goals,
      accounts: { ...(st.accounts || {}), ...base.accounts },
      rules: { ...(st.rules || {}), ...base.rules },
      overrides: { ...(st.overrides || {}), ...base.overrides },
      mappings: { ...(st.mappings || {}), ...base.mappings },
      settings: { ...base.settings, selfName: base.settings.selfName || st.settings?.selfName || '' }
    }
  };
}

export const backupFileName = () => `bachat-backup-${iso(new Date())}.txt`;

/** Saves the backup as a file. On phones that support sharing files, offers the share sheet (WhatsApp, Drive, Files…). */
export async function saveBackupFile(code: string, preferShare: boolean): Promise<'shared' | 'downloaded'> {
  const name = backupFileName();
  const file = new File([code], name, { type: 'text/plain' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (preferShare && nav.canShare && nav.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Bachat backup' });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
