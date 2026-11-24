#!/usr/bin/env node
// Vérifie le rendu mobile du thème Flairou NON PUBLIÉ (prévisualisation) avant publication.
//   SHOPIFY_STORE=xxx.myshopify.com [STOREFRONT_PASSWORD=…] [THEME_ID=123] node scripts/preview-mobile.mjs
// THEME_ID par défaut : celui enregistré par deploy.mjs dans backup/deploy-state.json.
// Sortie : screenshots/mobile-*.png + rapport (débordement horizontal, logo, textes anglais/lorem).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson } from './lib/content.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright'); // résout node_modules local ou NODE_PATH

const store = process.env.SHOPIFY_STORE;
if (!store) { console.error('SHOPIFY_STORE manquant'); process.exit(2); }
const stateFile = path.join(ROOT, 'backup', 'deploy-state.json');
const themeId = (process.env.THEME_ID || (fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).themeId) || '').toString().split('/').pop();
const product = readJson('content/product.json');
const urls = ['/', `/products/${product.handle}`, `/collections/${product.collection.handle}`, '/pages/faq', '/pages/livraison-retours', '/pages/cgv', '/pages/contact', '/cart'];
const out = path.join(ROOT, 'screenshots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
const page = await context.newPage();
const base = `https://${store}`;
const problems = [];

// Boutique protégée par mot de passe (boutique de développement / avant lancement)
await page.goto(base + '/password', { waitUntil: 'domcontentloaded' });
if (process.env.STOREFRONT_PASSWORD && (await page.locator('input[type="password"]').count())) {
  await page.fill('input[type="password"]', process.env.STOREFRONT_PASSWORD);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.locator('form[action*="password"] button, form[action*="password"] [type=submit]').first().click()]);
}
for (const u of urls) {
  const url = base + u + (themeId ? `${u.includes('?') ? '&' : '?'}preview_theme_id=${themeId}` : '');
  const res = await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => 'ERR ' + e.message }));
  const name = (u === '/' ? 'accueil' : u.replace(/\W+/g, '-').replace(/^-|-$/g, ''));
  await page.screenshot({ path: path.join(out, `mobile-${name}.png`), fullPage: true });
  const info = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    logo: !!document.querySelector('.header__heading-logo, .header__heading img'),
    text: document.body.innerText,
    password: !!document.querySelector('form[action*="password"]'),
  }));
  if (info.password) { problems.push(`${u} : page mot de passe affichée (définir STOREFRONT_PASSWORD)`); continue; }
  if (typeof res.status === 'function' && res.status() !== 200) problems.push(`${u} : HTTP ${res.status()}`);
  if (info.overflow > 2) problems.push(`${u} : débordement horizontal de ${info.overflow}px`);
  if (!info.logo) problems.push(`${u} : logo absent de l'en-tête`);
  const bad = info.text.match(/lorem ipsum|welcome to our store|shop all|you may also like|subscribe to our emails/i);
  if (bad) problems.push(`${u} : texte non traduit « ${bad[0]} »`);
  console.log(`✓ ${u} → screenshots/mobile-${name}.png`);
}
await browser.close();
console.log(problems.length ? `\n⚠️  ${problems.length} problème(s) :\n - ${problems.join('\n - ')}` : '\n✅ Rendu mobile OK (vérifier aussi visuellement les captures)');
process.exit(problems.length ? 1 : 0);
