# Rapport — Lancement de la boutique Flairou

Date : 24/11/2026

## ⚠️ État en une phrase
**Tout est prêt et testé hors-ligne, mais rien n'a encore été envoyé sur Shopify.** Dans l'environnement où j'ai travaillé, le token `SHOPIFY_ADMIN_TOKEN` n'était pas défini et le réseau refusait l'accès à `ma-boutique.myshopify.com`. Le déploiement complet se lance en une commande depuis votre poste : voir la section [Mise en ligne](#mise-en-ligne).

## Produit choisi
**Tapis de fouille pour chien**, marque **Flairou**, slogan « Le flair, c'est leur super-pouvoir. »

| Variante | Prix TTC | Coût estimé (produit + port) | Marge brute HT |
|---|---|---|---|
| Classique Ø 45 cm (Sauge / Sable) | 27,90 € | 8,50 € | 63 % |
| Grand 70 × 50 cm (Sauge / Sable) | 34,90 € | 11,50 € | 60 % |

Pourquoi ce produit ? C'est le seul des 5 candidats dont le **prix du marché français (22–42 €)** entre naturellement dans la fourchette 25–60 €. Il vérifie aussi l'effet « problème → solution » (le chien qui avale sa gamelle en 10 secondes), il est léger, il n'est pas fragile et il n'a pas de batterie. Les coûts fournisseurs sont **des estimations à confirmer par devis**. Détails : `RESEARCH.md`.

## Ce qui a été produit

| Étape | Livrables | Statut |
|---|---|---|
| 1. Recherche | `RESEARCH.md` : 5 candidats, prix relevés en France, marges HT, risques, sources | ✅ |
| 2. Marque | `BRAND.md`, logo SVG vectorisé + PNG (`brand/`) | ✅ |
| 3. Fiche produit | `PRODUCT.md` (lisible) / `content/product.json` (source) : titre SEO, description, 5 points forts, FAQ de 6 questions, 4 variantes, SKU, poids, meta | ✅ |
| 4. Boutique | `scripts/deploy.mjs` : collection, produit, médias, publication, 8 pages, 6 politiques, 2 menus. Contenus des pages dans `content/pages/` | ✅ prêt · ⏳ à exécuter |
| 5. Thème | Dawn 16.2.0 + `theme/overlay/` : couleurs, typos, logo, favicon, accueil (hero, bénéfices, comment ça marche, produit, FAQ, réassurance), en-tête, pied de page, page produit, page mot de passe | ✅ prêt · ⏳ push, vérification mobile et publication à exécuter |
| 6. Vérification | `scripts/verify.mjs` (sources + API), `scripts/preview-mobile.mjs`, `CHECKLIST.md` | ✅ local · ⏳ API et mobile |

### Contrôles réalisés
- `npm run verify:local` : **0 erreur**. Aucun lorem ipsum, aucun lien interne cassé, tous les montants cohérents (27,90 / 34,90 / 4,90 / 50 €), aucune allégation interdite, balises SEO aux bonnes longueurs, HTML bien formé. Un test négatif confirme que le vérificateur détecte bien ces erreurs.
- Orthographe : tous les textes passés au dictionnaire français, aucune faute (un anglicisme corrigé).
- Thème : `shopify theme check` ne signale rien dans nos fichiers. Le validateur maison, qui confronte chaque réglage aux schémas Dawn, est à 0 erreur après correction de 3 valeurs invalides héritées de Dawn.
- Déploiement : joué 2 fois contre un faux serveur Admin GraphQL local (`scripts/test/mock-admin.mjs`). Il a vérifié les sauvegardes avant modification, la nouvelle tentative après une erreur 502, le repli sans métachamps SEO, le contournement si la CLI du thème échoue, l'idempotence et la publication du thème. Ce test a trouvé **2 bogues, corrigés** : le lien « Accueil » retiré du menu, et un thème dupliqué à chaque relance. Il confirme que le script s'enchaîne correctement, **mais pas que Shopify accepte chaque champ** : le schéma GraphQL réel n'a pas pu être interrogé.
- Le token n'apparaît dans aucun fichier ni dans aucun journal (vérifié).

### Ce qui n'a pas pu être fait
- **Aucune création dans la boutique**, faute d'accès (voir ci-dessus).
- **Vérification mobile réelle** : le script est prêt, mais il a besoin de la boutique.
- **Photos produit** : `./images` était vide, donc 6 visuels provisoires ont été générés, clairement marqués « VISUEL PROVISOIRE ».

## Mise en ligne
```bash
npm install
export SHOPIFY_STORE=votre-boutique.myshopify.com SHOPIFY_ADMIN_TOKEN=…
npm run build:theme && npm run verify:local && npm run deploy:dry
npm run deploy                                   # tout, thème en NON publié
npm run verify                                   # relecture via l'API
STOREFRONT_PASSWORD=… npm run preview:mobile    # captures iPhone dans ./screenshots
npm run theme:publish                            # après contrôle des captures
```
Le script ne supprime rien. Avant de modifier un contenu existant (page, menu, politique, produit, collection), il l'enregistre dans `./backup/<date>/`. Il prend aussi un instantané complet de la boutique au départ. En cas d'erreur, il réessaie une fois, puis consigne le problème et continue (`backup/deploy-report-*.json`).

## Liens admin (à adapter : remplacez `ma-boutique` par l'identifiant réel)
- Produit : https://admin.shopify.com/store/ma-boutique/products?query=tapis-de-fouille-chien
- Collection : https://admin.shopify.com/store/ma-boutique/collections?query=tapis-de-fouille
- Pages : https://admin.shopify.com/store/ma-boutique/pages
- Menus : https://admin.shopify.com/store/ma-boutique/content/menus
- Politiques : https://admin.shopify.com/store/ma-boutique/settings/legal
- Thèmes : https://admin.shopify.com/store/ma-boutique/themes
- Paiements (à activer vous-même) : https://admin.shopify.com/store/ma-boutique/settings/payments
- Expédition : https://admin.shopify.com/store/ma-boutique/settings/shipping

## Décisions principales (détail : `DECISIONS.md`)
- Gourde 2-en-1 écartée : vendue 6–15 € en animalerie, donc un prix à 27,90 € n'est pas crédible.
- Marge calculée **hors TVA**. Aucun prix barré, aucun compteur de stock, aucun avis.
- Livraison 4,90 €, offerte dès 50 €, livrée en 7–12 jours ouvrés, retours à la charge du client sauf non-conformité. **Ces tarifs sont à saisir dans Shopify.**
- Page « Se rétracter du contrat ici » ajoutée pour la directive (UE) 2023/2673 (applicable depuis juin 2026). À faire valider.
- Aucun lien vers la plateforme européenne RLL, fermée en 2025. Seul le médiateur reste obligatoire.

## Ce qui reste à faire (détail : `CHECKLIST.md`)
1. Lancer le déploiement ci-dessus.
2. Paiements, domaine, devise/langue/taxes, **frais de livraison**, bandeau cookies.
3. Identité légale : raison sociale, **SIRET**, TVA, adresse, **médiateur**, adresse de retour (36 champs [À COMPLÉTER]).
4. Fournisseur : devis, échantillon, **informations GPSR** (fabricant + responsable UE), connexion de l'app et des SKU.
5. Vraies photos produit.
6. **Commande test**, test du formulaire de rétractation, puis retrait du mot de passe de la boutique.

## Arborescence
```
RESEARCH.md BRAND.md PRODUCT.md DECISIONS.md CHECKLIST.md TODO.md RAPPORT.md
brand/            logo.svg, logo-inverse.svg, logo-mark.svg (+ PNG)
images/           6 visuels PROVISOIRES
content/          product.json, menus.json, pages/*.html (1re ligne = titre + SEO)
theme/            make_overlay.py, validate_templates.py, overlay/ (fichiers Dawn personnalisés)
scripts/          build-theme.sh, deploy.mjs, verify.mjs, preview-mobile.mjs, render-product-md.mjs, lib/, test/mock-admin.mjs
```
