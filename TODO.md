# TODO — Lancement boutique Flairou

Légende : `[x]` fait · `[~]` préparé hors-ligne, à exécuter contre la boutique · `[ ]` à faire

## 1. Recherche produit
- [x] 5 candidats évalués (prix, marge, angle, risques) → `RESEARCH.md`
- [x] Produit retenu et justifié : tapis de fouille pour chien

## 2. Marque
- [x] Nom original (recherche d'antériorité web sommaire) → `BRAND.md`
- [x] Slogan, palette 3 couleurs, typographies, ton de voix
- [x] Logo SVG → `brand/logo.svg`, `brand/logo-mark.svg` (+ PNG générés)
- [ ] Recherche d'antériorité INPI / EUIPO complète (manuel → `CHECKLIST.md`)

## 3. Fiche produit
- [x] Titre SEO, description bénéfices, 5 bullets, FAQ 6 questions → `PRODUCT.md`
- [x] Variantes, prix (pas de prix barré : aucun prix antérieur réel), SKU, poids
- [x] Meta title / meta description
- [x] Données machine → `content/product.json`

## 4. Boutique Shopify (API)
- [~] Script de déploiement GraphQL idempotent → `scripts/deploy.mjs`
- [~] Produit + variantes + collection + publication canal Boutique en ligne
- [~] Images : `./images` était vide → placeholders générés (signalé dans `DECISIONS.md`)
- [~] Pages : À propos, Contact, FAQ, Livraison & retours, Mentions légales, CGV, Confidentialité, Se rétracter → `content/pages/`
- [~] Politiques Shopify (remboursement, confidentialité, CGV, livraison, mentions légales)
- [~] Menus principal et pied de page → `content/menus.json`
- [~] Sauvegarde automatique dans `./backup` avant toute modification d'un contenu existant
- [ ] **Exécution réelle** : bloquée (token absent + hôte Shopify refusé par le réseau de cet environnement) — voir `RAPPORT.md`

## 5. Thème
- [x] Dawn 16.2.0 récupéré, overlay de personnalisation → `theme/overlay/`
- [x] Couleurs, typos, logo, accueil (hero, bénéfices, comment ça marche, produit, FAQ, réassurance)
- [x] Lint `shopify theme check` sur le thème assemblé
- [~] Push en non publié (`themeCreate` + `themeFilesUpsert`) → `scripts/deploy.mjs`
- [~] Vérif mobile → `scripts/preview-mobile.mjs` (captures 390 px)
- [~] Publication → `node scripts/deploy.mjs --only=theme-publish` après vérification

## 6. Vérification
- [x] Relecture locale des contenus (liens internes, prix, lorem ipsum, placeholders) → `scripts/verify.mjs --local`
- [~] Relecture via l'API après déploiement → `scripts/verify.mjs`
- [x] `CHECKLIST.md` (actions manuelles)
- [x] `RAPPORT.md`
