// Synchronisation entre IndexedDB (local) et le dépôt GitHub.
// Fichiers dans le dépôt :
//   <dossier>/journal.json          → toutes les entrées, lieux et notes
//   <dossier>/photos/<id>.jpg       → les photos
// Fusion : pour chaque id, la version avec le updatedAt le plus récent gagne.
// Les suppressions sont conservées sous forme de « pierres tombales » (deleted: true).

import { db } from './db.js';
import * as gh from './github.js';

export const DEFAULT_SETTINGS = { owner: '', repo: '', branch: 'main', folder: 'data', token: '' };

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.getMeta('settings', {})) };
}
export async function saveSettings(s) {
  await db.setMeta('settings', s);
}

function paths(s) {
  const folder = (s.folder || 'data').replace(/^\/+|\/+$/g, '');
  return {
    data: `${folder}/journal.json`,
    photo: id => `${folder}/photos/${id}.jpg`,
  };
}

/** Fusionne deux listes d'éléments ; renvoie { merged, localChanges }. */
export function mergeItems(localItems, remoteItems) {
  const byId = new Map(localItems.map(i => [i.id, i]));
  const localChanges = [];
  for (const r of remoteItems) {
    const l = byId.get(r.id);
    if (!l || (r.updatedAt || '') > (l.updatedAt || '')) {
      byId.set(r.id, r);
      localChanges.push(r);
    }
  }
  const merged = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { merged, localChanges };
}

function serialize(items) {
  return JSON.stringify({ app: 'journal-de-bord', version: 1, items }, null, 1);
}

let running = null;

/** Lance une synchronisation (une seule à la fois). */
export function sync(onStep = () => {}) {
  if (!running) running = doSync(onStep).finally(() => { running = null; });
  return running;
}

async function doSync(onStep, attempt = 0) {
  const s = await getSettings();
  if (!gh.isConfigured(s)) throw new Error('GitHub n\'est pas configuré (onglet Réglages).');
  const p = paths(s);

  // 1. Envoyer les photos pas encore en ligne.
  const items = await db.allItems();
  const used = new Set(items.filter(i => !i.deleted).flatMap(i => i.photos || []));
  const pending = (await db.allPhotos()).filter(ph => !ph.uploaded && used.has(ph.id));
  let n = 0;
  for (const ph of pending) {
    onStep(`Envoi des photos ${++n}/${pending.length}…`);
    const bytes = new Uint8Array(await ph.blob.arrayBuffer());
    try {
      await gh.putFile(s, p.photo(ph.id), gh.bytesToBase64(bytes), `Photo ${ph.id}`);
    } catch (e) {
      // 422 : le fichier existe déjà (envoyé lors d'une synchro interrompue).
      if (!(e instanceof gh.GitHubError && e.status === 422)) throw e;
    }
    await db.putPhoto({ ...ph, uploaded: true });
  }

  // 2. Récupérer la version distante et fusionner.
  onStep('Récupération…');
  const remote = await gh.getText(s, p.data);
  let remoteItems = [];
  if (remote) {
    try {
      remoteItems = JSON.parse(remote.text).items || [];
    } catch {
      throw new Error(`${p.data} dans le dépôt n'est pas un JSON valide.`);
    }
  }
  const { merged, localChanges } = mergeItems(await db.allItems(), remoteItems);
  if (localChanges.length) await db.putItems(localChanges);

  // 3. Envoyer la version fusionnée si elle diffère.
  const out = serialize(merged);
  const remoteNormalized = remote ? serialize(mergeItems([], remoteItems).merged) : null;
  if (out !== remoteNormalized) {
    onStep('Envoi…');
    try {
      await gh.putFile(s, p.data, gh.textToBase64(out),
        `Journal : mise à jour ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        remote ? remote.sha : undefined);
    } catch (e) {
      // Conflit : quelqu'un (un autre appareil) a écrit entre-temps → on recommence.
      if (e instanceof gh.GitHubError && (e.status === 409 || e.status === 422) && attempt < 2) {
        return doSync(onStep, attempt + 1);
      }
      throw e;
    }
  }

  const when = new Date().toISOString();
  await db.setMeta('lastSync', when);
  return { pulled: localChanges.length, pushedPhotos: pending.length, when };
}

/** Récupère une photo absente localement (ex. ajoutée depuis un autre appareil). */
export async function fetchPhoto(id) {
  const s = await getSettings();
  if (!gh.isConfigured(s)) return null;
  const blob = await gh.getBlob(s, paths(s).photo(id));
  await db.putPhoto({ id, blob, uploaded: true });
  return blob;
}
