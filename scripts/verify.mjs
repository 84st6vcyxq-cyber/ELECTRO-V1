#!/usr/bin/env node
// Vérification des contenus Flairou.
//   node scripts/verify.mjs --local   → contrôle des fichiers sources (sans réseau)
//   node scripts/verify.mjs           → relit la boutique via l'API et compare aux sources
// Contrôles : lorem ipsum / texte provisoire, liens internes, prix, allégations interdites,
// longueur des balises SEO, équilibre HTML, champs [À COMPLÉTER] restants (listés, non bloquants).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, productDescriptionHtml, loadPages } from './lib/content.mjs';
import { createClient } from './lib/shopify.mjs';

const LOCAL = process.argv.includes('--local');
const product = readJson('content/product.json');
const pages = loadPages();
const menus = readJson('content/menus.json');
const errors = [], warnings = [], todo = {};
const err = (w, m) => errors.push(`${w} : ${m}`);
const warn = (w, m) => warnings.push(`${w} : ${m}`);

const handles = {
  pages: new Set(pages.map((p) => p.handle)),
  products: new Set([product.handle]),
  collections: new Set([product.collection.handle, 'all']),
};
const ALLOWED_EUROS = new Set(['27,90', '34,90', '4,90', '50', '300 000']);
const FORBIDDEN = [
  /lorem|ipsum|dolor sit/i, /\bTODO\b|\bFIXME\b|\bxxx\b/, /\b(welcome to our store|shop all|subscribe to our emails|you may also like)\b/i,
  /anxi[ée]t[ée]|\bstress|v[ée]t[ée]rinaire|\bm[ée]dical|soign|gu[ée]ri[rt]|th[ée]rap/i,
  /\bn°\s?1\b|num[ée]ro\s?1|meilleur du march[ée]|r[ée]volutionnaire|miracle/i,
  /plus que \d+ en stock|stock limit[ée]|\d+ personnes (regardent|consultent)|derni[eè]res? pi[eè]ces?/i,
  /avis clients?|★|⭐/i,
];
const ALLOWED_CONTEXT = [/sans promesse de santé/i, /de faux stock limité/i, /« calme son anxiété »/, /« recommandé par les vétérinaires »/];

function textChecks(where, html) {
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const re of FORBIDDEN) {
    const m = text.match(re);
    if (m && !ALLOWED_CONTEXT.some((a) => a.test(text.slice(Math.max(0, m.index - 40), m.index + 60)))) err(where, `texte interdit ou douteux « ${m[0]} »`);
  }
  for (const m of text.matchAll(/(\d[\d  ]*(?:,\d{2})?)\s?€/g)) {
    const v = m[1].replace(/[  ]/g, ' ').trim();
    if (!ALLOWED_EUROS.has(v)) err(where, `montant inattendu « ${m[0]} » (prix de référence : 27,90 / 34,90 / livraison 4,90 / franco 50)`);
  }
  const n = (text.match(/\[À (COMPLÉTER|VÉRIFIER)[^\]]*\]/g) || []).length;
  if (n) todo[where] = n;
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const u = m[1];
    if (/^https?:\/\//.test(u) || u.startsWith('mailto:') || u === '/') continue;
    const mm = u.match(/^\/(pages|products|collections)\/([\w-]+)$/);
    if (!mm) err(where, `lien interne non reconnu « ${u} »`);
    else if (!handles[mm[1]].has(mm[2])) err(where, `lien cassé « ${u} »`);
  }
  // équilibre des balises
  const stack = [];
  for (const t of html.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)) {
    const tag = t[1].toLowerCase();
    if (['br', 'img', 'hr', 'meta', 'input'].includes(tag)) continue;
    if (t[0][1] === '/') { if (stack.pop() !== tag) { err(where, `HTML mal imbriqué près de </${tag}>`); break; } }
    else stack.push(tag);
  }
  if (stack.length) err(where, `balises non fermées : ${stack.join(', ')}`);
  const dbl = html.match(/[^\s>] {2,}[^\s<]/);
  if (dbl) warn(where, `espaces multiples « ${dbl[0]} »`);
}
const seoCheck = (where, seo) => {
  if (!seo?.title || seo.title.length > 60) err(where, `meta title absent ou > 60 caractères (${seo?.title?.length})`);
  if (!seo?.description || seo.description.length > 160 || seo.description.length < 70) err(where, `meta description hors 70–160 caractères (${seo?.description?.length})`);
};

// ---------- Sources locales ----------
const desc = productDescriptionHtml(product);
textChecks('produit', desc + product.title);
seoCheck('produit', product.seo);
seoCheck('collection', product.collection.seo);
if (product.compareAtPrice) err('produit', 'prix barré présent : interdit sans prix antérieur réel');
if (product.faq.length !== 6) err('produit', `FAQ : ${product.faq.length} questions (6 attendues)`);
if (product.bullets.length !== 5) err('produit', `${product.bullets.length} bullet points (5 attendus)`);
for (const v of product.variants) {
  const p = Number(v.price);
  if (p < 25 || p > 60) err('produit', `prix ${v.price} hors fourchette 25–60 €`);
  if (!fs.existsSync(path.join(ROOT, 'images', v.image))) err('produit', `image manquante ${v.image}`);
}
if (new Set(product.variants.map((v) => v.sku)).size !== product.variants.length) err('produit', 'SKU en double');
for (const p of pages) { textChecks(`page ${p.handle}`, p.body); seoCheck(`page ${p.handle}`, p.seo); }
for (const [h, m] of Object.entries(menus)) for (const it of m.items) {
  if (!it.ref) continue;
  const [k, v] = it.ref.split(':');
  if (!handles[k + 's'].has(v)) err(`menu ${h}`, `référence cassée ${it.ref}`);
}
const required = ['a-propos', 'contact', 'faq', 'livraison-retours', 'mentions-legales', 'cgv', 'politique-de-confidentialite'];
for (const r of required) if (!handles.pages.has(r)) err('pages', `page obligatoire manquante : ${r}`);
// Thème : textes et liens shopify://
for (const f of ['templates/index.json', 'templates/product.json', 'sections/header-group.json', 'sections/footer-group.json', 'templates/password.json']) {
  const raw = fs.readFileSync(path.join(ROOT, 'theme', 'overlay', f), 'utf8');
  const vals = []; JSON.parse(raw, (k, v) => { if (typeof v === 'string') vals.push(v); return v; });
  textChecks(`thème ${f}`, vals.filter((v) => !v.startsWith('shopify://')).join('\n'));
  for (const v of vals) {
    const m = v.match(/^shopify:\/\/(pages|products|collections)\/([\w-]+)$/);
    if (m && !handles[m[1]].has(m[2])) err(`thème ${f}`, `lien cassé ${v}`);
  }
  for (const m of raw.matchAll(/"page": "([\w-]+)"/g)) if (!handles.pages.has(m[1])) err(`thème ${f}`, `page inconnue ${m[1]}`);
}

// ---------- Boutique (API) ----------
if (!LOCAL) {
  const { gql } = createClient({ store: process.env.SHOPIFY_STORE, token: process.env.SHOPIFY_ADMIN_TOKEN, apiVersion: process.env.SHOPIFY_API_VERSION || '2026-10', baseUrl: process.env.SHOPIFY_ADMIN_BASE_URL, log: console.log });
  const d = await gql(`query VerifyAll($p: String!) {
    shop { currencyCode shopPolicies { type body } }
    products(first: 1, query: $p) { nodes { id handle title status onlineStoreUrl descriptionHtml seo { title description }
      media(first: 20) { nodes { id } } collections(first: 5) { nodes { handle } }
      variants(first: 20) { nodes { sku price compareAtPrice title } } } }
    pages(first: 250) { nodes { handle title body isPublished templateSuffix } }
    menus(first: 50) { nodes { handle title items { title type url resourceId } } }
    themes(first: 50) { nodes { id name role } }
  }`, { p: `handle:${product.handle}` });
  if (d.shop.currencyCode !== 'EUR') err('boutique', `devise ${d.shop.currencyCode} ≠ EUR`);
  const p = d.products.nodes[0];
  if (!p) err('boutique', 'produit introuvable');
  else {
    if (p.status !== 'ACTIVE') err('boutique', `statut produit ${p.status}`);
    if (!p.onlineStoreUrl) err('boutique', 'produit non publié sur la Boutique en ligne');
    if (!p.media.nodes.length) err('boutique', 'produit sans image');
    if (!p.collections.nodes.some((c) => c.handle === product.collection.handle)) err('boutique', 'produit hors collection');
    for (const v of product.variants) {
      const r = p.variants.nodes.find((x) => x.sku === v.sku);
      if (!r) err('boutique', `variante ${v.sku} absente`);
      else {
        if (Number(r.price) !== Number(v.price)) err('boutique', `${v.sku} : prix ${r.price} ≠ ${v.price}`);
        if (r.compareAtPrice) err('boutique', `${v.sku} : prix barré ${r.compareAtPrice} présent`);
      }
    }
    textChecks('boutique produit', p.descriptionHtml);
  }
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  for (const lp of pages) {
    const rp = d.pages.nodes.find((x) => x.handle === lp.handle);
    if (!rp) { err('boutique', `page ${lp.handle} absente`); continue; }
    if (!rp.isPublished) err('boutique', `page ${lp.handle} non publiée`);
    if (norm(rp.body) !== norm(lp.body)) warn('boutique', `page ${lp.handle} : contenu différent de la source (modifiée dans l'admin ?)`);
    textChecks(`boutique page ${lp.handle}`, rp.body);
  }
  for (const [h, m] of Object.entries(menus)) {
    const rm = d.menus.nodes.find((x) => x.handle === h);
    if (!rm) err('boutique', `menu ${h} absent`);
    else if (rm.items.length !== m.items.length) err('boutique', `menu ${h} : ${rm.items.length} liens au lieu de ${m.items.length}`);
  }
  for (const t of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'REFUND_POLICY', 'SHIPPING_POLICY', 'LEGAL_NOTICE']) {
    if (!d.shop.shopPolicies.find((x) => x.type === t && x.body)) err('boutique', `politique ${t} vide`);
  }
  const th = d.themes.nodes.find((t) => t.name.startsWith('Flairou'));
  if (!th) err('boutique', 'thème Flairou absent');
  else console.log(`Thème Flairou : ${th.id} (${th.role})`);
}

// ---------- Rapport ----------
console.log(`\nVérification ${LOCAL ? 'locale' : 'boutique + locale'}`);
console.log(errors.length ? `❌ ${errors.length} erreur(s) :\n - ${errors.join('\n - ')}` : '✅ Aucune erreur');
if (warnings.length) console.log(`⚠️  ${warnings.length} avertissement(s) :\n - ${warnings.join('\n - ')}`);
const total = Object.values(todo).reduce((a, b) => a + b, 0);
console.log(`📝 ${total} champ(s) [À COMPLÉTER]/[À VÉRIFIER] restant(s) :`);
for (const [w, n] of Object.entries(todo)) console.log(`   ${w} : ${n}`);
process.exit(errors.length ? 1 : 0);
