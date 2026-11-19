// Accès minimal à l'API « Contents » de GitHub pour lire/écrire les données du journal.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isConfigured(s) {
  return !!(s && s.owner && s.repo && s.token);
}

function headers(s, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${s.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function contentsUrl(s, path) {
  const clean = path.split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${clean}`;
}

async function check(res) {
  if (res.ok) return res;
  let msg = `Erreur GitHub ${res.status}`;
  try {
    const body = await res.json();
    if (body.message) msg += ` : ${body.message}`;
  } catch { /* ignore */ }
  if (res.status === 401) msg = 'Jeton invalide ou expiré (401).';
  if (res.status === 404) msg = 'Dépôt, branche ou fichier introuvable — ou jeton sans accès (404).';
  throw new GitHubError(res.status, msg);
}

// ----- Encodage base64 (UTF-8 et binaire) -----
export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToText(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ----- Opérations -----
export async function testRepo(s) {
  const res = await fetch(`${API}/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}`,
    { headers: headers(s), cache: 'no-store' });
  await check(res);
  const repo = await res.json();
  return { private: repo.private, canPush: !!(repo.permissions && repo.permissions.push), defaultBranch: repo.default_branch };
}

/** Lit un fichier texte. Renvoie { sha, text } ou null s'il n'existe pas. */
export async function getText(s, path) {
  const url = `${contentsUrl(s, path)}?ref=${encodeURIComponent(s.branch || 'main')}`;
  const res = await fetch(url, { headers: headers(s), cache: 'no-store' });
  if (res.status === 404) return null;
  await check(res);
  const meta = await res.json();
  let text;
  if (meta.content && meta.encoding === 'base64') {
    text = base64ToText(meta.content);
  } else {
    // Fichier > 1 Mo : il faut le récupérer en brut.
    const raw = await fetch(url, { headers: headers(s, 'application/vnd.github.raw+json'), cache: 'no-store' });
    await check(raw);
    text = await raw.text();
  }
  return { sha: meta.sha, text };
}

/** Lit un fichier binaire (photo). */
export async function getBlob(s, path) {
  const url = `${contentsUrl(s, path)}?ref=${encodeURIComponent(s.branch || 'main')}`;
  const res = await fetch(url, { headers: headers(s, 'application/vnd.github.raw+json'), cache: 'no-store' });
  await check(res);
  return res.blob();
}

/** Crée ou met à jour un fichier. contentB64 = contenu déjà encodé en base64. */
export async function putFile(s, path, contentB64, message, sha) {
  const body = { message, content: contentB64, branch: s.branch || 'main' };
  if (sha) body.sha = sha;
  const res = await fetch(contentsUrl(s, path), {
    method: 'PUT',
    headers: { ...headers(s), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await check(res);
  const out = await res.json();
  return out.content.sha;
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}
