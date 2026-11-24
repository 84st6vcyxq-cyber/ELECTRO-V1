// Faux serveur Admin GraphQL (tests locaux de scripts/deploy.mjs et verify.mjs, sans boutique réelle).
// Simule une boutique de développement avec du contenu préexistant (page « contact », menus par défaut),
// une erreur transitoire (pour tester la nouvelle tentative) et un refus des métachamps de page.
// Usage : node scripts/test/mock-admin.mjs [port]
import http from 'node:http';

const port = Number(process.argv[2] || 8787);
let n = 100;
const gid = (t) => `gid://shopify/${t}/${++n}`;
const db = {
  products: [], collections: [],
  pages: [{ id: gid('Page'), handle: 'contact', title: 'Contact', body: '<p>Ancienne page contact</p>', templateSuffix: 'contact', isPublished: true }],
  menus: [
    { id: gid('Menu'), handle: 'main-menu', title: 'Main menu', items: [{ id: gid('MenuItem'), title: 'Home', type: 'FRONTPAGE', url: '/', resourceId: null, items: [] }] },
    { id: gid('Menu'), handle: 'footer', title: 'Footer menu', items: [{ id: gid('MenuItem'), title: 'Search', type: 'SEARCH', url: '/search', resourceId: null, items: [] }] },
  ],
  policies: [{ type: 'REFUND_POLICY', title: 'Refund policy', body: '<p>Old refund policy</p>' }],
  themes: [{ id: gid('OnlineStoreTheme'), name: 'Dawn', role: 'MAIN', processing: false }],
  files: [], published: new Set(), calls: {},
};
let failedOnce = false;

const handlers = {
  Preflight: () => ({ shop: { name: 'Boutique test', myshopifyDomain: 'test.myshopify.com', currencyCode: 'EUR' }, shopLocales: [{ locale: 'fr', primary: true, published: true }], publications: { nodes: [{ id: 'gid://shopify/Publication/1', name: 'Online Store' }] } }),
  Snapshot: () => ({ products: { nodes: db.products }, collections: { nodes: db.collections }, pages: { nodes: db.pages }, menus: { nodes: db.menus }, shop: { shopPolicies: db.policies }, themes: { nodes: db.themes } }),
  FindFile: (v) => ({ files: { nodes: db.files.filter((f) => `filename:${f.name}` === v.q) } }),
  StagedUpload: (v) => ({ stagedUploadsCreate: { stagedTargets: [{ url: `http://localhost:${port}/upload`, resourceUrl: `https://staged.example/${v.input[0].filename}`, parameters: [{ name: 'key', value: v.input[0].filename }] }], userErrors: [] } }),
  FileCreate: (v) => { v.files.forEach((f) => db.files.push({ id: gid('MediaImage'), name: f.originalSource.split('/').pop(), fileStatus: 'READY' })); return { fileCreate: { files: [], userErrors: [] } }; },
  FindCollection: (v) => ({ collections: { nodes: db.collections.filter((c) => `handle:${c.handle}` === v.q) } }),
  CollectionCreate: (v) => { const c = { id: gid('Collection'), ...v.input }; db.collections.push(c); return { collectionCreate: { collection: { id: c.id }, userErrors: [] } }; },
  CollectionUpdate: (v) => { Object.assign(db.collections.find((c) => c.id === v.input.id), v.input); return { collectionUpdate: { collection: { id: v.input.id }, userErrors: [] } }; },
  FindProduct: (v) => ({ products: { nodes: db.products.filter((p) => `handle:${p.handle}` === v.q) } }),
  ProductSet: (v) => {
    const inp = v.input;
    if (!inp.variants?.every((x) => x.optionValues?.length === inp.productOptions.length)) return { productSet: { product: null, userErrors: [{ field: ['variants'], message: 'optionValues incomplets', code: 'INVALID' }] } };
    let p = inp.id && db.products.find((x) => x.id === inp.id);
    const variants = { nodes: inp.variants.map((x) => ({ id: gid('ProductVariant'), sku: x.sku, price: x.price, compareAtPrice: x.compareAtPrice, title: x.optionValues.map((o) => o.name).join(' / ') })) };
    if (!p) { p = { id: gid('Product'), media: { nodes: (inp.files || []).map(() => ({ id: gid('MediaImage') })) } }; db.products.push(p); }
    Object.assign(p, { handle: inp.handle, title: inp.title, status: inp.status, descriptionHtml: inp.descriptionHtml, seo: inp.seo, tags: inp.tags, vendor: inp.vendor, variants, collections: inp.collections });
    return { productSet: { product: { id: p.id, handle: p.handle, status: p.status, variants }, userErrors: [] } };
  },
  Ids: (v) => ({ products: { nodes: db.products.filter((p) => `handle:${p.handle}` === v.p) }, collections: { nodes: db.collections.filter((c) => `handle:${c.handle}` === v.c) } }),
  Publish: (v) => { db.published.add(v.id); return { publishablePublish: { userErrors: [] } }; },
  Pages: () => ({ pages: { nodes: db.pages } }),
  PageCreate: (v) => {
    if (v.page.metafields) return { pageCreate: { page: null, userErrors: [{ field: ['metafields'], message: 'metafields not supported (simulation)' }] } };
    const p = { id: gid('Page'), ...v.page }; db.pages.push(p); return { pageCreate: { page: { id: p.id }, userErrors: [] } };
  },
  PageUpdate: (v) => { const { metafields, ...rest } = v.page; Object.assign(db.pages.find((p) => p.id === v.id), rest); return { pageUpdate: { page: { id: v.id }, userErrors: [] } }; },
  Policies: () => ({ shop: { shopPolicies: db.policies } }),
  PolicyUpdate: (v) => {
    const ex = db.policies.find((p) => p.type === v.p.type);
    if (ex) ex.body = v.p.body; else db.policies.push({ type: v.p.type, title: v.p.type, body: v.p.body });
    return { shopPolicyUpdate: { shopPolicy: { id: gid('ShopPolicy') }, userErrors: [] } };
  },
  MenuRefs: (v) => ({ pages: { nodes: db.pages }, products: { nodes: db.products.filter((p) => `handle:${p.handle}` === v.p) }, menus: { nodes: db.menus } }),
  MenuUpdate: (v) => { Object.assign(db.menus.find((m) => m.id === v.id), { title: v.title, items: v.items }); return { menuUpdate: { menu: { id: v.id }, userErrors: [] } }; },
  MenuCreate: (v) => { db.menus.push({ id: gid('Menu'), handle: v.handle, title: v.title, items: v.items }); return { menuCreate: { menu: { id: 'x' }, userErrors: [] } }; },
  ThemeCreate: (v) => { const t = { id: gid('OnlineStoreTheme'), name: v.name, role: 'UNPUBLISHED', processing: false, files: {} }; db.themes.push(t); return { themeCreate: { theme: { id: t.id, processing: false }, userErrors: [] } }; },
  ThemeStatus: () => ({ theme: { processing: false, processingFailed: false } }),
  ThemeFiles: (v) => { const t = db.themes.find((x) => x.id === v.id); v.files.forEach((f) => (t.files[f.filename] = f.body.value)); return { themeFilesUpsert: { upsertedThemeFiles: v.files.map((f) => ({ filename: f.filename })), userErrors: [] } }; },
  ThemePublish: (v) => { db.themes.forEach((t) => (t.role = t.id === v.id ? 'MAIN' : 'UNPUBLISHED')); return { themePublish: { theme: { id: v.id, role: 'MAIN' }, userErrors: [] } }; },
  // Lecture pour verify.mjs
  VerifyAll: (v) => ({
    shop: { currencyCode: 'EUR', shopPolicies: db.policies },
    products: { nodes: db.products.filter((p) => `handle:${p.handle}` === v.p).map((p) => ({ ...p, onlineStoreUrl: db.published.has(p.id) ? `https://test/products/${p.handle}` : null, media: p.media, collections: { nodes: db.collections.filter((c) => (p.collections || []).includes(c.id)).map((c) => ({ handle: c.handle })) } })) },
    pages: { nodes: db.pages }, menus: { nodes: db.menus },
    themes: { nodes: db.themes.map(({ files, ...t }) => t) },
  }),
};
handlers.PageCreate2 = handlers.PageCreate; handlers.PageUpdate2 = handlers.PageUpdate;
['Themes', 'Themes2', 'Themes3'].forEach((k) => (handlers[k] = () => ({ themes: { nodes: db.themes.map(({ files, ...t }) => t) } })));

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/upload') { res.writeHead(204); return res.end(); }
    if (req.url === '/__db') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ...db, published: [...db.published] })); }
    if (!req.headers['x-shopify-access-token']) { res.writeHead(401); return res.end('{"errors":"[API] Invalid API key"}'); }
    const { query, variables } = JSON.parse(body);
    const name = (query.match(/(?:query|mutation)\s+(\w+)/) || [])[1];
    db.calls[name] = (db.calls[name] || 0) + 1;
    if (name === 'Pages' && !failedOnce) { failedOnce = true; res.writeHead(502); return res.end('Bad gateway (simulation)'); }
    const h = handlers[name];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(h ? { data: h(variables || {}) } : { errors: [{ message: `Opération non simulée : ${name}` }] }));
  });
}).listen(port, () => console.log(`mock admin sur http://localhost:${port}`));
