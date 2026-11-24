#!/usr/bin/env node
// Déploiement Flairou sur Shopify via l'Admin API GraphQL (+ Shopify CLI pour le thème).
//
//   SHOPIFY_STORE=xxx.myshopify.com SHOPIFY_ADMIN_TOKEN=… node scripts/deploy.mjs
//   node scripts/deploy.mjs --dry-run              # aucun appel réseau, écrit les charges utiles dans build/dry-run
//   node scripts/deploy.mjs --only=pages,menus     # étapes choisies
//   node scripts/deploy.mjs --only=theme-publish   # publie le thème Flairou (après vérification mobile)
//
// Règles : idempotent (recherche par handle avant de créer), sauvegarde dans ./backup avant toute
// modification d'un contenu existant, 1 nouvelle tentative par appel puis on documente et on continue.
// Ne touche jamais aux paiements, domaines, commandes. Le token n'est jamais écrit ni journalisé.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJson, productDescriptionHtml, loadPages } from './lib/content.mjs';
import { createClient, stagedUpload } from './lib/shopify.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DRY = !!args['dry-run'];
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';
const STORE = process.env.SHOPIFY_STORE;
const THEME_NAME = 'Flairou – Dawn 16.2.0';
const DEFAULT_STEPS = ['preflight', 'backup', 'files', 'collection', 'product', 'publish', 'pages', 'policies', 'menus', 'theme'];
const STEPS = args.only ? String(args.only).split(',') : DEFAULT_STEPS;

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.join(ROOT, 'backup', STAMP);
const STATE_FILE = path.join(ROOT, 'backup', 'deploy-state.json');
const DRY_DIR = path.join(ROOT, 'build', 'dry-run');
const report = { startedAt: new Date().toISOString(), store: STORE, apiVersion: API_VERSION, dryRun: DRY, steps: {}, problems: [] };
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

const log = (...m) => console.log(...m);
function backup(name, data) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const f = path.join(BACKUP_DIR, name.replace(/[^\w.-]+/g, '_') + '.json');
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
  log(`  💾 sauvegarde : ${path.relative(ROOT, f)}`);
}
function dry(name, payload) {
  fs.mkdirSync(DRY_DIR, { recursive: true });
  fs.writeFileSync(path.join(DRY_DIR, name + '.json'), JSON.stringify(payload, null, 2));
  log(`  [dry-run] ${name} → build/dry-run/${name}.json`);
}
const problem = (step, msg) => { report.problems.push({ step, msg }); log(`  ⚠️  ${msg}`); };

let gql = async () => { throw new Error('Client non initialisé'); };
if (!DRY) {
  try {
    ({ gql } = createClient({ store: STORE, token: process.env.SHOPIFY_ADMIN_TOKEN, apiVersion: API_VERSION, baseUrl: process.env.SHOPIFY_ADMIN_BASE_URL, log }));
  } catch (e) {
    console.error('❌ ' + e.message); process.exit(2);
  }
}

const product = readJson('content/product.json');
const pages = loadPages();
const menus = readJson('content/menus.json');
const ctx = { publicationId: null, collectionId: null, productId: null, pageIds: {}, images: {} };

// ---------------------------------------------------------------------------------------------
const steps = {
  async preflight() {
    if (DRY) return log('  (dry-run) contrôles de la boutique ignorés');
    const d = await gql(`query Preflight {
      shop { name myshopifyDomain currencyCode }
      shopLocales { locale primary published }
      publications(first: 25) { nodes { id name } }
    }`);
    log(`  Boutique : ${d.shop.name} (${d.shop.myshopifyDomain}) — devise ${d.shop.currencyCode}`);
    if (d.shop.currencyCode !== 'EUR') problem('preflight', `Devise de la boutique = ${d.shop.currencyCode}, attendu EUR (à changer dans Paramètres > Détails de la boutique, avant toute vente).`);
    const primary = d.shopLocales.find((l) => l.primary)?.locale;
    if (!String(primary).startsWith('fr')) problem('preflight', `Langue principale = ${primary}, attendu fr (Paramètres > Langues).`);
    const pub = d.publications.nodes.find((p) => /online store|boutique en ligne/i.test(p.name));
    if (!pub) problem('preflight', 'Canal « Boutique en ligne » introuvable : le produit ne pourra pas être publié automatiquement.');
    ctx.publicationId = pub?.id;
    report.shop = d.shop;
  },

  async backup() {
    if (DRY) return log('  (dry-run) instantané ignoré');
    const d = await gql(`query Snapshot {
      products(first: 100) { nodes { id handle title status } }
      collections(first: 100) { nodes { id handle title } }
      pages(first: 100) { nodes { id handle title body templateSuffix isPublished } }
      menus(first: 50) { nodes { id handle title items { title type url resourceId items { title type url resourceId } } } }
      shop { shopPolicies { type title body url } }
      themes(first: 50) { nodes { id name role } }
    }`);
    backup('snapshot-initial', d);
  },

  async files() {
    const dir = path.join(ROOT, 'images');
    const brand = path.join(ROOT, 'brand');
    const list = [
      ...fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => ({ file: path.join(dir, f), name: f })),
      { file: path.join(brand, 'logo.png'), name: 'flairou-logo.png' },
      { file: path.join(brand, 'logo-mark.png'), name: 'flairou-favicon.png' },
    ];
    for (const it of list) {
      const mime = it.name.endsWith('.png') ? 'image/png' : it.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      if (DRY) { ctx.images[it.name] = `staged://${it.name}`; continue; }
      try {
        const q = await gql(`query FindFile($q: String!) { files(first: 1, query: $q) { nodes { id fileStatus ... on MediaImage { image { url } } } } }`, { q: `filename:${it.name}` });
        const resourceUrl = await stagedUpload(gql, { filename: it.name, mimeType: mime, buffer: fs.readFileSync(it.file) });
        ctx.images[it.name] = resourceUrl; // sert de source pour les médias produit
        if (q.files.nodes.length) { log(`  = ${it.name} déjà présent dans Fichiers`); continue; }
        // Les fichiers « Fichiers » servent au thème (logo, favicon, bannière) : shopify://shop_images/<nom>
        if (/^flairou-(logo|favicon|hero)\.png$/.test(it.name)) {
          await gql(`mutation FileCreate($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id fileStatus } userErrors { field message } } }`,
            { files: [{ originalSource: resourceUrl, contentType: 'IMAGE', alt: it.name.includes('hero') ? 'Visuel Flairou' : 'Logo Flairou' }] },
            { userErrorsPath: 'fileCreate.userErrors' });
          log(`  + ${it.name} ajouté aux Fichiers`);
        } else log(`  ↑ ${it.name} téléversé`);
      } catch (e) { problem('files', `${it.name} : ${e.message}`); }
    }
    report.placeholderImages = true;
  },

  async collection() {
    const c = product.collection;
    const input = { title: c.title, handle: c.handle, descriptionHtml: c.descriptionHtml, seo: c.seo };
    if (DRY) return dry('collection', input);
    const q = await gql(`query FindCollection($q: String!) { collections(first: 1, query: $q) { nodes { id handle title descriptionHtml } } }`, { q: `handle:${c.handle}` });
    const existing = q.collections.nodes[0];
    if (existing) {
      backup(`collection-${c.handle}`, existing);
      await gql(`mutation CollectionUpdate($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
        { input: { id: existing.id, ...input } }, { userErrorsPath: 'collectionUpdate.userErrors' });
      ctx.collectionId = existing.id; log(`  ~ collection mise à jour (${c.handle})`);
    } else {
      const d = await gql(`mutation CollectionCreate($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`,
        { input }, { userErrorsPath: 'collectionCreate.userErrors' });
      ctx.collectionId = d.collectionCreate.collection.id; log(`  + collection créée (${c.handle})`);
    }
  },

  async product() {
    const fileFor = (name, alt) => ({ originalSource: ctx.images[name], alt, contentType: 'IMAGE' });
    const variantAlt = (v) => `Tapis de fouille Flairou ${v.options.Taille}, coloris ${v.options.Couleur} (visuel provisoire)`;
    const input = {
      handle: product.handle, title: product.title, vendor: product.vendor, productType: product.productType,
      status: product.status, tags: product.tags, seo: product.seo, descriptionHtml: productDescriptionHtml(product),
      collections: ctx.collectionId ? [ctx.collectionId] : undefined,
      productOptions: product.options.map((o, i) => ({ name: o.name, position: i + 1, values: o.values.map((name) => ({ name })) })),
      variants: product.variants.map((v) => ({
        optionValues: Object.entries(v.options).map(([optionName, name]) => ({ optionName, name })),
        price: v.price, compareAtPrice: null, sku: v.sku, taxable: true, inventoryPolicy: 'DENY',
        inventoryItem: { tracked: false, requiresShipping: true, measurement: { weight: { value: v.weightGrams, unit: 'GRAMS' } } },
        ...(ctx.images[v.image] ? { file: fileFor(v.image, variantAlt(v)) } : {}),
      })),
    };
    const files = [
      ...product.variants.filter((v) => ctx.images[v.image]).map((v) => fileFor(v.image, variantAlt(v))),
      ...product.extraImages.filter((x) => ctx.images[x.file]).map((x) => fileFor(x.file, x.alt)),
    ];
    if (DRY) return dry('product', { ...input, files });
    const q = await gql(`query FindProduct($q: String!) { products(first: 1, query: $q) { nodes { id handle title status descriptionHtml media(first: 20) { nodes { id } } variants(first: 20) { nodes { id sku price } } } } }`, { q: `handle:${product.handle}` });
    const existing = q.products.nodes[0];
    if (existing) {
      backup(`product-${product.handle}`, existing);
      input.id = existing.id;
      // Produit déjà présent : on ne renvoie pas les médias (évite doublons/suppressions) ni les fichiers de variantes.
      input.variants.forEach((v) => delete v.file);
    } else input.files = files;
    const d = await gql(`mutation ProductSet($input: ProductSetInput!) {
      productSet(synchronous: true, input: $input) {
        product { id handle status variants(first: 20) { nodes { id sku price } } }
        userErrors { field message code }
      } }`, { input }, { userErrorsPath: 'productSet.userErrors' });
    ctx.productId = d.productSet.product.id;
    log(`  ${existing ? '~ produit mis à jour' : '+ produit créé'} : ${d.productSet.product.handle} (${d.productSet.product.variants.nodes.length} variantes)`);
  },

  async publish() {
    if (DRY) return log('  (dry-run) publication sur la Boutique en ligne');
    if (!ctx.publicationId) return problem('publish', 'Pas de publication « Boutique en ligne » : publier manuellement le produit et la collection.');
    if (!ctx.productId || !ctx.collectionId) {
      const q = await gql(`query Ids($p: String!, $c: String!) { products(first: 1, query: $p) { nodes { id } } collections(first: 1, query: $c) { nodes { id } } }`,
        { p: `handle:${product.handle}`, c: `handle:${product.collection.handle}` });
      ctx.productId ||= q.products.nodes[0]?.id; ctx.collectionId ||= q.collections.nodes[0]?.id;
    }
    for (const id of [ctx.productId, ctx.collectionId].filter(Boolean)) {
      await gql(`mutation Publish($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
        { id, input: [{ publicationId: ctx.publicationId }] }, { userErrorsPath: 'publishablePublish.userErrors' });
    }
    log('  ✓ produit et collection publiés sur la Boutique en ligne');
  },

  async pages() {
    const existing = DRY ? [] : (await gql(`query Pages { pages(first: 250) { nodes { id handle title body templateSuffix isPublished } } }`)).pages.nodes;
    let seoRefused = false; // dès qu'un refus des métachamps SEO est constaté, on ne les renvoie plus
    for (const p of pages) {
      const page = {
        title: p.title, handle: p.handle, body: p.body, isPublished: true, templateSuffix: p.templateSuffix || null,
        metafields: [
          { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: p.seo.title },
          { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: p.seo.description },
        ],
      };
      if (DRY) { dry(`page-${p.handle}`, page); continue; }
      if (seoRefused) delete page.metafields;
      try {
        const ex = existing.find((x) => x.handle === p.handle);
        if (ex) {
          backup(`page-${p.handle}`, ex);
          await gql(`mutation PageUpdate($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { field message } } }`,
            { id: ex.id, page }, { userErrorsPath: 'pageUpdate.userErrors' });
          ctx.pageIds[p.handle] = ex.id; log(`  ~ page mise à jour : ${p.handle}`);
        } else {
          const d = await gql(`mutation PageCreate($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { field message } } }`,
            { page }, { userErrorsPath: 'pageCreate.userErrors' });
          ctx.pageIds[p.handle] = d.pageCreate.page.id; log(`  + page créée : ${p.handle}`);
        }
      } catch (e) {
        // Contournement : certains schémas refusent les métachamps SEO à la création → sans SEO, puis on le signale.
        if (page.metafields && /metafield/i.test(e.message)) {
          seoRefused = true;
          try {
            const { metafields, ...bare } = page;
            const ex = existing.find((x) => x.handle === p.handle);
            if (ex) await gql(`mutation PageUpdate2($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { field message } } }`, { id: ex.id, page: bare }, { userErrorsPath: 'pageUpdate.userErrors' });
            else await gql(`mutation PageCreate2($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { field message } } }`, { page: bare }, { userErrorsPath: 'pageCreate.userErrors' });
            log(`  + page ${p.handle} publiée sans métachamps SEO`);
            continue;
          } catch (e2) { e = e2; }
        }
        problem('pages', `${p.handle} : ${e.message}`);
      }
    }
    if (seoRefused) problem('pages', 'Métachamps SEO refusés par l\'API : saisir meta title/description des pages dans l\'admin (valeurs dans content/pages/*.html, 1re ligne).');
  },

  async policies() {
    // Politiques légales Shopify (liées dans le paiement et le pied de page), alimentées par nos pages.
    const map = {
      TERMS_OF_SERVICE: 'cgv', PRIVACY_POLICY: 'politique-de-confidentialite', REFUND_POLICY: 'livraison-retours',
      SHIPPING_POLICY: 'livraison-retours', LEGAL_NOTICE: 'mentions-legales', CONTACT_INFORMATION: 'contact',
    };
    const current = DRY ? [] : (await gql(`query Policies { shop { shopPolicies { type title body } } }`)).shop.shopPolicies;
    for (const [type, handle] of Object.entries(map)) {
      const body = pages.find((p) => p.handle === handle).body;
      if (DRY) { dry(`policy-${type}`, { type, body: body.slice(0, 200) + '…' }); continue; }
      try {
        const ex = current.find((c) => c.type === type);
        if (ex?.body) backup(`policy-${type}`, ex);
        await gql(`mutation PolicyUpdate($p: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $p) { shopPolicy { id } userErrors { field message } } }`,
          { p: { type, body } }, { userErrorsPath: 'shopPolicyUpdate.userErrors' });
        log(`  ✓ politique ${type}`);
      } catch (e) { problem('policies', `${type} : ${e.message}`); }
    }
  },

  async menus() {
    let pageIds = ctx.pageIds, productId = ctx.productId, existing = [];
    if (!DRY) {
      const d = await gql(`query MenuRefs($p: String!) {
        pages(first: 250) { nodes { id handle } }
        products(first: 1, query: $p) { nodes { id } }
        menus(first: 50) { nodes { id handle title items { id title type url resourceId items { id title type url resourceId } } } }
      }`, { p: `handle:${product.handle}` });
      pageIds = Object.fromEntries(d.pages.nodes.map((p) => [p.handle, p.id]));
      productId = d.products.nodes[0]?.id; existing = d.menus.nodes;
    }
    for (const [handle, m] of Object.entries(menus)) {
      const items = m.items.map((it) => {
        const out = { title: it.title, type: it.type };
        if (it.url) out.url = it.url;
        if (it.ref) {
          const [kind, h] = it.ref.split(':');
          out.resourceId = DRY ? `gid://shopify/${kind}/${h}` : kind === 'page' ? pageIds[h] : productId;
          if (!out.resourceId) problem('menus', `Référence introuvable pour « ${it.title} » (${it.ref})`);
        }
        return out;
      }).filter((it) => !/^(PAGE|PRODUCT|COLLECTION)$/.test(it.type) || it.resourceId);
      if (DRY) { dry(`menu-${handle}`, { handle, title: m.title, items }); continue; }
      try {
        const ex = existing.find((x) => x.handle === handle);
        if (ex) {
          backup(`menu-${handle}`, ex);
          await gql(`mutation MenuUpdate($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
            menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } } }`,
            { id: ex.id, title: m.title, handle, items }, { userErrorsPath: 'menuUpdate.userErrors' });
          log(`  ~ menu mis à jour : ${handle}`);
        } else {
          await gql(`mutation MenuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
            menuCreate(title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } } }`,
            { title: m.title, handle, items }, { userErrorsPath: 'menuCreate.userErrors' });
          log(`  + menu créé : ${handle}`);
        }
      } catch (e) { problem('menus', `${handle} : ${e.message}`); }
    }
  },

  async theme() {
    const build = path.join(ROOT, 'theme', 'build');
    if (!fs.existsSync(path.join(build, 'layout', 'theme.liquid'))) {
      log('  Assemblage du thème…');
      const r = spawnSync(path.join(ROOT, 'scripts', 'build-theme.sh'), { stdio: 'inherit' });
      if (r.status !== 0) return problem('theme', 'Échec de l\'assemblage du thème (scripts/build-theme.sh).');
    }
    if (DRY) return log(`  (dry-run) push de theme/build en NON PUBLIÉ sous le nom « ${THEME_NAME} »`);
    const themes = (await gql(`query Themes { themes(first: 50) { nodes { id name role } } }`)).themes.nodes;
    const mine = themes.find((t) => t.name === THEME_NAME && t.role !== 'MAIN');
    const cliArgs = ['theme', 'push', '--path', build, '--store', STORE, '--json', ...(mine ? ['--theme', mine.id.split('/').pop()] : ['--unpublished', '--theme', THEME_NAME])];
    const cli = process.env.SHOPIFY_CLI_BIN || 'shopify';
    log(`  shopify ${cliArgs.map((a) => (a === STORE ? '<boutique>' : a)).join(' ')}`);
    // Le token passe par l'environnement (SHOPIFY_CLI_THEME_TOKEN), jamais en argument visible.
    let r = { status: 1 };
    for (let attempt = 1; attempt <= 2 && r.status !== 0; attempt++) {
      r = spawnSync(cli, cliArgs, { env: { ...process.env, SHOPIFY_CLI_THEME_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN, SHOPIFY_CLI_NO_ANALYTICS: '1' }, encoding: 'utf8' });
      if (r.status !== 0 && attempt === 1) log('  ↻ shopify theme push a échoué, nouvelle tentative…');
    }
    if (r.status === 0) {
      const after = (await gql(`query Themes2 { themes(first: 50) { nodes { id name role } } }`)).themes.nodes.find((t) => t.name === THEME_NAME);
      state.themeId = after?.id; log(`  ✓ thème poussé en non publié : ${after?.id}`);
      return;
    }
    problem('theme', `Shopify CLI indisponible ou en échec (${(r.stderr || r.error?.message || '').slice(0, 300)}). Contournement : themeCreate + themeFilesUpsert.`);
    try {
      const tag = 'v16.2.0';
      let id = mine?.id;
      if (!id) {
      const d = await gql(`mutation ThemeCreate($source: URL!, $name: String!) { themeCreate(source: $source, name: $name, role: UNPUBLISHED) { theme { id processing } userErrors { field message } } }`,
        { source: `https://github.com/Shopify/dawn/archive/refs/tags/${tag}.zip`, name: THEME_NAME }, { userErrorsPath: 'themeCreate.userErrors' });
      id = d.themeCreate.theme.id;
      for (let i = 0; i < 40; i++) {
        const t = await gql(`query ThemeStatus($id: ID!) { theme(id: $id) { processing processingFailed } }`, { id });
        if (t.theme.processingFailed) throw new Error('traitement du thème en échec');
        if (!t.theme.processing) break;
        await new Promise((ok) => setTimeout(ok, 3000));
      }
      } else log(`  = thème « ${THEME_NAME} » déjà présent (${id}) : mise à jour des fichiers personnalisés`);
      const overlay = path.join(ROOT, 'theme', 'overlay');
      const files = [];
      const walk = (d0) => fs.readdirSync(d0, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d0, e.name)) : files.push(path.join(d0, e.name)));
      walk(overlay);
      await gql(`mutation ThemeFiles($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $id, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }`,
        { id, files: files.map((f) => ({ filename: path.relative(overlay, f), body: { type: 'TEXT', value: fs.readFileSync(f, 'utf8') } })) },
        { userErrorsPath: 'themeFilesUpsert.userErrors' });
      state.themeId = id; log(`  ✓ thème non publié prêt via l'API : ${id}`);
    } catch (e) { problem('theme', `Contournement API en échec : ${e.message}. Pousser manuellement : shopify theme push --unpublished --path theme/build`); }
  },

  async 'theme-publish'() {
    if (DRY) return log('  (dry-run) publication du thème');
    const themes = (await gql(`query Themes3 { themes(first: 50) { nodes { id name role } } }`)).themes.nodes;
    const mine = themes.find((t) => t.name === THEME_NAME);
    if (!mine) return problem('theme-publish', `Thème « ${THEME_NAME} » introuvable : lancer d'abord l'étape theme.`);
    if (mine.role === 'MAIN') return log('  = déjà publié');
    backup('theme-main-avant-publication', themes.find((t) => t.role === 'MAIN') || {}); // l'ancien thème reste disponible (non supprimé)
    await gql(`mutation ThemePublish($id: ID!) { themePublish(id: $id) { theme { id role } userErrors { field message } } }`, { id: mine.id }, { userErrorsPath: 'themePublish.userErrors' });
    log(`  ✓ thème publié : ${mine.id}`);
  },
};

// ---------------------------------------------------------------------------------------------
for (const name of STEPS) {
  if (!steps[name]) { problem(name, `Étape inconnue « ${name} »`); continue; }
  log(`\n▶ ${name}`);
  try { await steps[name](); report.steps[name] = 'ok'; }
  catch (e) { report.steps[name] = 'échec'; problem(name, e.message); }
}
report.finishedAt = new Date().toISOString();
fs.mkdirSync(path.join(ROOT, 'backup'), { recursive: true });
if (!DRY) fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, lastRun: report.finishedAt }, null, 2));
const reportFile = path.join(ROOT, 'backup', `deploy-report-${STAMP}${DRY ? '-dry-run' : ''}.json`);
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
log(`\n${report.problems.length ? `⚠️  ${report.problems.length} problème(s) documenté(s)` : '✅ Terminé sans problème'} — rapport : ${path.relative(ROOT, reportFile)}`);
process.exit(report.problems.length ? 1 : 0);
