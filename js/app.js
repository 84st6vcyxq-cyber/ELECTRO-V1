import { db } from './db.js';
import { sync, fetchPhoto, getSettings, saveSettings, mergeItems } from './sync.js';
import { isConfigured, testRepo } from './github.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
};

const TYPE_LABELS = { journal: 'Entrée', place: 'Lieu', note: 'Note' };
let items = [];          // éléments non supprimés, en mémoire
let settings = null;
const filters = { journal: '', note: '' };

// ============================================================
// Utilitaires
// ============================================================
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();

function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : nowIso();
}
const fmtDate = iso => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonth = iso => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const fmtCoords = (lat, lng) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation indisponible'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Position refusée ou indisponible')),
      { enableHighAccuracy: true, timeout: 15000 });
  });
}

// ============================================================
// Photos
// ============================================================
const photoUrls = new Map();

async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  const p = (async () => {
    let rec = await db.getPhoto(id);
    let blob = rec && rec.blob;
    if (!blob) {
      try { blob = await fetchPhoto(id); } catch { blob = null; }
    }
    return blob ? URL.createObjectURL(blob) : null;
  })();
  photoUrls.set(id, p);
  const url = await p;
  if (!url) photoUrls.delete(id); // réessayer plus tard
  return url;
}

function setImg(img, id) {
  photoUrl(id).then(url => { if (url) img.src = url; });
}

/** Redimensionne et compresse une image en JPEG (max 1600 px). */
function compressImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function openViewer(id) {
  const v = $('#viewer');
  const img = v.querySelector('img');
  img.removeAttribute('src');
  setImg(img, id);
  v.hidden = false;
}
$('#viewer').addEventListener('click', () => { $('#viewer').hidden = true; });

// ============================================================
// Données
// ============================================================
async function loadItems() {
  items = (await db.allItems()).filter(i => !i.deleted);
}

async function saveItem(item) {
  item.updatedAt = nowIso();
  await db.putItem(item);
  await loadItems();
  renderAll();
  scheduleSync();
}

async function deleteItem(item) {
  // Pierre tombale : on garde l'id pour propager la suppression aux autres appareils.
  const tomb = { id: item.id, type: item.type, deleted: true, createdAt: item.createdAt, updatedAt: nowIso() };
  await db.putItem(tomb);
  for (const pid of item.photos || []) await db.deletePhoto(pid);
  await loadItems();
  renderAll();
  scheduleSync();
}

// ============================================================
// Listes
// ============================================================
function matches(item, q) {
  if (!q) return true;
  const hay = [item.title, item.body, (item.tags || []).join(' ')].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function card(item) {
  const txt = el('div', { className: 'txt' });
  if (item.type !== 'note') txt.append(el('div', { className: 'date', textContent: `${item.mood ? item.mood + ' ' : ''}${fmtDate(item.date)}` }));
  txt.append(el('h3', { textContent: item.title || (item.type === 'place' ? 'Lieu sans nom' : 'Sans titre') }));
  if (item.body) txt.append(el('p', { textContent: item.body }));
  const badges = [];
  if (item.lat != null && item.type !== 'place') badges.push('📍');
  if (item.photos && item.photos.length) badges.push(`📷 ${item.photos.length}`);
  if (item.tags && item.tags.length) badges.push(item.tags.map(t => '#' + t).join(' '));
  if (item.type === 'note') badges.push(`modifiée le ${new Date(item.updatedAt).toLocaleDateString('fr-FR')}`);
  if (badges.length) txt.append(el('div', { className: 'badges', textContent: badges.join('  ·  ') }));

  const c = el('div', { className: 'card' }, txt);
  if (item.photos && item.photos.length) {
    const img = el('img', { className: 'thumb', alt: '', loading: 'lazy' });
    setImg(img, item.photos[0]);
    c.append(img);
  }
  c.addEventListener('click', () => openEditor(item));
  return c;
}

function renderJournal() {
  const list = $('#list-journal');
  list.replaceChildren();
  const rows = items.filter(i => i.type === 'journal' && matches(i, filters.journal))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) {
    list.append(el('p', { className: 'empty', textContent: filters.journal ? 'Aucun résultat.' : 'Ton journal est vide.\nAppuie sur ＋ pour écrire ta première entrée.' }));
    return;
  }
  let month = '';
  for (const it of rows) {
    const m = fmtMonth(it.date);
    if (m !== month) { list.append(el('div', { className: 'month', textContent: m })); month = m; }
    list.append(card(it));
  }
}

function renderNotes() {
  const list = $('#list-note');
  list.replaceChildren();
  const rows = items.filter(i => i.type === 'note' && matches(i, filters.note))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (!rows.length) {
    list.append(el('p', { className: 'empty', textContent: filters.note ? 'Aucun résultat.' : 'Aucune note pour le moment.' }));
    return;
  }
  rows.forEach(it => list.append(card(it)));
}

function renderPlacesList() {
  const list = $('#list-place');
  list.replaceChildren();
  const rows = items.filter(i => i.lat != null).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) {
    list.append(el('p', { className: 'empty', textContent: 'Aucun lieu enregistré.' }));
    return;
  }
  for (const it of rows) {
    const c = card(it);
    const go = el('button', { className: 'btn small', textContent: 'Voir' });
    go.addEventListener('click', e => {
      e.stopPropagation();
      $('#places-sheet').hidden = true;
      focusOnMap(it);
    });
    c.querySelector('.txt').append(go);
    list.append(c);
  }
}

function renderAll() {
  renderJournal();
  renderNotes();
  if (!$('#places-sheet').hidden) renderPlacesList();
  renderMarkers();
}

$$('[data-search]').forEach(input => input.addEventListener('input', () => {
  filters[input.dataset.search] = input.value.trim();
  input.dataset.search === 'journal' ? renderJournal() : renderNotes();
}));

// ============================================================
// Onglets
// ============================================================
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'map') initMap();
  localStorage.setItem('lastView', name);
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$$('[data-new]').forEach(b => b.addEventListener('click', () => openEditor(newItem(b.dataset.new))));

function newItem(type, extra = {}) {
  const t = nowIso();
  return { id: uid(), type, title: '', body: '', date: t, mood: '', tags: [], lat: null, lng: null, photos: [], createdAt: t, updatedAt: t, ...extra, _new: true };
}

// ============================================================
// Éditeur
// ============================================================
let editing = null;       // copie de travail de l'élément
let addedPhotos = [];     // photos ajoutées pendant cette édition (supprimées si on annule)

function openEditor(item) {
  editing = { ...item, tags: [...(item.tags || [])], photos: [...(item.photos || [])] };
  addedPhotos = [];
  const type = editing.type;
  $('#ed-heading').textContent = editing._new ? `Nouvelle ${type === 'journal' ? 'entrée' : type === 'place' ? 'fiche lieu' : 'note'}` : TYPE_LABELS[type];
  $('#ed-title').value = editing.title || '';
  $('#ed-title').placeholder = type === 'place' ? 'Nom du lieu' : 'Titre';
  $('#ed-body').value = editing.body || '';
  $('#ed-body').placeholder = type === 'place' ? 'Souvenirs, conseils, impressions…' : 'Écris ici…';
  $('#ed-date').value = toLocalInput(editing.date);
  $('#ed-mood').value = editing.mood || '';
  $('#ed-tags').value = (editing.tags || []).join(', ');
  $('#ed-date-row').hidden = type === 'note';
  $('#ed-mood-wrap').hidden = type !== 'journal';
  $('.loc-row').hidden = type === 'note';
  $('#ed-delete').hidden = !!editing._new;
  renderEditorLocation();
  renderEditorPhotos();
  $('#editor').hidden = false;
  if (editing._new && type !== 'place') setTimeout(() => $('#ed-title').focus(), 50);
}

function renderEditorLocation() {
  const has = editing.lat != null;
  $('#ed-loc-label').textContent = has ? `📍 ${fmtCoords(editing.lat, editing.lng)}` : 'Aucun emplacement';
  $('#ed-loc-clear').hidden = !has || editing.type === 'place';
}

function renderEditorPhotos() {
  const box = $('#ed-photos');
  box.replaceChildren();
  editing.photos.forEach((id, idx) => {
    const img = el('img', { alt: '' });
    setImg(img, id);
    img.addEventListener('click', () => openViewer(id));
    const rm = el('button', { textContent: '✕', title: 'Retirer' });
    rm.addEventListener('click', () => { editing.photos.splice(idx, 1); renderEditorPhotos(); });
    box.append(el('div', { className: 'photo' }, img, rm));
  });
}

function closeEditor() {
  $('#editor').hidden = true;
  editing = null;
}

$('#ed-cancel').addEventListener('click', async () => {
  for (const id of addedPhotos) await db.deletePhoto(id);
  closeEditor();
});

$('#ed-save').addEventListener('click', async () => {
  const it = editing;
  it.title = $('#ed-title').value.trim();
  it.body = $('#ed-body').value;
  it.tags = $('#ed-tags').value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
  if (it.type !== 'note') it.date = fromLocalInput($('#ed-date').value);
  if (it.type === 'journal') it.mood = $('#ed-mood').value;
  if (!it.title && !it.body.trim() && !it.photos.length) {
    toast('Rien à enregistrer.');
    return;
  }
  // Photos retirées pendant l'édition : on les efface localement.
  const original = items.find(i => i.id === it.id);
  const removed = (original ? original.photos || [] : []).concat(addedPhotos).filter(p => !it.photos.includes(p));
  for (const pid of removed) await db.deletePhoto(pid);
  delete it._new;
  closeEditor();
  await saveItem(it);
  toast('Enregistré ✓');
});

$('#ed-delete').addEventListener('click', async () => {
  if (!confirm('Supprimer définitivement cet élément ?')) return;
  const original = items.find(i => i.id === editing.id) || editing;
  closeEditor();
  await deleteItem(original);
  toast('Supprimé');
});

$('#ed-loc-here').addEventListener('click', async () => {
  try {
    const pos = await getPosition();
    Object.assign(editing, pos);
    renderEditorLocation();
  } catch (e) { toast(e.message); }
});
$('#ed-loc-clear').addEventListener('click', () => {
  editing.lat = editing.lng = null;
  renderEditorLocation();
});

$('#ed-photo-input').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) {
    try {
      const blob = await compressImage(f);
      const id = uid();
      await db.putPhoto({ id, blob, uploaded: false });
      addedPhotos.push(id);
      if (editing) editing.photos.push(id);
    } catch (err) { toast(`${f.name} : ${err.message}`); }
  }
  if (editing) renderEditorPhotos();
});

// ============================================================
// Carte
// ============================================================
let map = null;
let markerLayer = null;
let meMarker = null;

function initMap() {
  if (map) { setTimeout(() => map.invalidateSize(), 0); return; }
  map = L.map('map', { zoomControl: false, worldCopyJump: true }).setView([30, 5], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  markerLayer = L.featureGroup().addTo(map);
  map.on('click', e => offerNewPlace(e.latlng.lat, e.latlng.lng));
  renderMarkers();
  if (markerLayer.getLayers().length) map.fitBounds(markerLayer.getBounds(), { padding: [40, 40], maxZoom: 12 });
}

const journalIcon = () => L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#1c6fdc;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

function popupFor(item) {
  const box = el('div');
  if (item.photos && item.photos.length) {
    const img = el('img', { className: 'popup-thumb', alt: '' });
    setImg(img, item.photos[0]);
    box.append(img);
  }
  box.append(el('strong', { textContent: item.title || (item.type === 'place' ? 'Lieu sans nom' : 'Sans titre') }));
  box.append(el('div', { textContent: `${item.type === 'journal' ? '📔 ' : ''}${fmtDate(item.date)}`, style: 'color:#888;font-size:12px' }));
  const open = el('button', { className: 'btn small', textContent: 'Ouvrir' });
  open.addEventListener('click', () => openEditor(item));
  box.append(open);
  return box;
}

function renderMarkers() {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  for (const it of items) {
    if (it.lat == null) continue;
    const m = it.type === 'place' ? L.marker([it.lat, it.lng]) : L.marker([it.lat, it.lng], { icon: journalIcon() });
    m.bindPopup(() => popupFor(it));
    m._itemId = it.id;
    markerLayer.addLayer(m);
  }
}

function focusOnMap(item) {
  showView('map');
  map.setView([item.lat, item.lng], Math.max(map.getZoom(), 13));
  const m = markerLayer.getLayers().find(l => l._itemId === item.id);
  if (m) m.openPopup();
}

function offerNewPlace(lat, lng, name = '') {
  const box = el('div');
  if (name) box.append(el('strong', { textContent: name }), el('br'));
  box.append(el('span', { textContent: fmtCoords(lat, lng), style: 'color:#888;font-size:12px' }), el('br'));
  const add = el('button', { className: 'btn small primary', textContent: '＋ Ajouter un lieu ici' });
  add.addEventListener('click', () => {
    map.closePopup();
    const item = newItem('place', { lat, lng, title: name });
    openEditor(item);
    if (!name) reverseGeocode(lat, lng).then(n => {
      if (n && editing && editing.id === item.id && !$('#ed-title').value) $('#ed-title').value = n;
    });
  });
  box.append(add);
  L.popup().setLatLng([lat, lng]).setContent(box).openOn(map);
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=fr&lat=${lat}&lon=${lng}`);
    const j = await r.json();
    const a = j.address || {};
    return a.city || a.town || a.village || a.suburb || a.county || j.name || '';
  } catch { return ''; }
}

$('#geo-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#geo-query').value.trim();
  if (!q) return;
  $('#geo-query').blur();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&q=${encodeURIComponent(q)}`);
    const [hit] = await r.json();
    if (!hit) return toast('Aucun résultat.');
    const lat = +hit.lat, lng = +hit.lon;
    if (hit.boundingbox) {
      const [s, n, w, ea] = hit.boundingbox.map(Number);
      map.fitBounds([[s, w], [n, ea]], { maxZoom: 15 });
    } else map.setView([lat, lng], 13);
    offerNewPlace(lat, lng, hit.name || hit.display_name.split(',')[0]);
  } catch { toast('Recherche impossible (hors ligne ?).'); }
});

$('#btn-locate').addEventListener('click', async () => {
  try {
    const { lat, lng } = await getPosition();
    map.setView([lat, lng], 14);
    if (meMarker) meMarker.remove();
    meMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#34c759', fillOpacity: 1 }).addTo(map);
    offerNewPlace(lat, lng);
  } catch (e) { toast(e.message); }
});

$('#btn-places').addEventListener('click', () => {
  renderPlacesList();
  $('#places-sheet').hidden = false;
});
$('#places-close').addEventListener('click', () => { $('#places-sheet').hidden = true; });

// ============================================================
// Synchronisation
// ============================================================
let syncTimer;
function scheduleSync(delay = 2000) {
  if (!isConfigured(settings)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(false), delay);
}

function setStatus(text, cls = '') {
  const s = $('#sync-status');
  s.textContent = text;
  s.className = `status ${cls}`;
}

async function showLastSync() {
  if (!isConfigured(settings)) return setStatus('Non configuré — les données restent sur cet appareil.');
  const last = await db.getMeta('lastSync');
  setStatus(last ? `Dernière synchro : ${new Date(last).toLocaleString('fr-FR')}` : 'Configuré, jamais synchronisé.', last ? 'ok' : '');
}

async function runSync(manual = true) {
  if (!isConfigured(settings)) {
    if (manual) { toast('Configure GitHub dans Réglages.'); showView('settings'); }
    return;
  }
  if (!navigator.onLine) { if (manual) toast('Hors ligne : synchro plus tard.'); return; }
  $$('.sync-btn').forEach(b => b.classList.add('spinning'));
  try {
    const res = await sync(step => setStatus(step));
    await loadItems();
    renderAll();
    await showLastSync();
    if (manual) toast(res.pulled ? `Synchronisé ✓ (${res.pulled} élément(s) reçu(s))` : 'Synchronisé ✓');
  } catch (e) {
    setStatus(e.message, 'err');
    if (manual) toast(e.message, 4000);
  } finally {
    $$('.sync-btn').forEach(b => b.classList.remove('spinning'));
  }
}

$$('.sync-btn').forEach(b => b.addEventListener('click', () => runSync(true)));
window.addEventListener('online', () => scheduleSync(500));

// ============================================================
// Réglages
// ============================================================
const form = $('#settings-form');

function fillSettingsForm() {
  for (const k of ['owner', 'repo', 'branch', 'folder', 'token']) form.elements[k].value = settings[k] || '';
}
function readSettingsForm() {
  const v = k => form.elements[k].value.trim();
  return { owner: v('owner'), repo: v('repo'), branch: v('branch') || 'main', folder: v('folder') || 'data', token: v('token') };
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  settings = readSettingsForm();
  await saveSettings(settings);
  toast('Réglages enregistrés');
  await showLastSync();
  if (isConfigured(settings)) runSync(false);
});

$('#btn-test').addEventListener('click', async () => {
  const s = readSettingsForm();
  if (!isConfigured(s)) return setStatus('Renseigne propriétaire, dépôt et jeton.', 'err');
  setStatus('Test en cours…');
  try {
    const r = await testRepo(s);
    if (!r.canPush) return setStatus('Accès en lecture seulement : le jeton doit avoir « Contents : Read and write ».', 'err');
    setStatus(`Connexion OK ✓ — dépôt ${r.private ? 'privé' : 'PUBLIC ⚠️ (tes données seraient visibles par tous)'}.`, r.private ? 'ok' : 'err');
  } catch (e) { setStatus(e.message, 'err'); }
});

$('#btn-sync-now').addEventListener('click', () => runSync(true));

$('#btn-export').addEventListener('click', async () => {
  const all = await db.allItems();
  const blob = new Blob([JSON.stringify({ app: 'journal-de-bord', version: 1, items: all }, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `journal-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
});

$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.items)) throw new Error('Format inconnu');
    const { localChanges } = mergeItems(await db.allItems(), data.items);
    await db.putItems(localChanges);
    await loadItems();
    renderAll();
    scheduleSync();
    toast(`${localChanges.length} élément(s) importé(s)`);
  } catch (err) { toast(`Import impossible : ${err.message}`); }
});

// ============================================================
// Démarrage
// ============================================================
(async function start() {
  settings = await getSettings();
  fillSettingsForm();
  await loadItems();
  renderAll();
  showView(localStorage.getItem('lastView') || 'journal');
  await showLastSync();
  scheduleSync(300);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
