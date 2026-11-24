# Checklist : ce qu'il vous reste à faire

Ordre conseillé. 🔴 = bloquant avant d'ouvrir la boutique au public.

## A. Lancer le déploiement (≈ 15 min)
- [ ] 🔴 Créer une app personnalisée : *Paramètres > Applications > Développer des apps*. Scopes : `write_products`, `write_publications`, `write_online_store_pages`, `write_online_store_navigation`, `write_legal_policies`, `write_files`, `write_themes`, `read_locales`. Copier le token Admin API.
- [ ] 🔴 Sur votre poste (Node ≥ 20, Python 3, git) :
  ```bash
  npm install
  export SHOPIFY_STORE=votre-boutique.myshopify.com
  export SHOPIFY_ADMIN_TOKEN=…          # jamais dans un fichier
  npm run build:theme                   # Dawn 16.2.0 + personnalisation, puis validation
  npm run verify:local
  npm run deploy:dry                    # aperçu sans appel réseau
  npm run deploy                        # produit, collection, pages, politiques, menus, thème NON publié
  npm run verify                        # relecture via l'API
  STOREFRONT_PASSWORD=… npm run preview:mobile   # captures mobiles dans ./screenshots
  npm run theme:publish                 # seulement après avoir regardé les captures
  ```
- [ ] Lire `backup/deploy-report-*.json` : chaque problème rencontré y est consigné (par ex. métachamps SEO des pages refusés → à saisir à la main).

## B. Identité légale (obligatoire)
- [ ] 🔴 Remplacer les **[À COMPLÉTER]** : `npm run verify:local` les compte (36 champs). Raison sociale, forme juridique, capital, adresse, RCS/RNE, **SIRET**, TVA intracommunautaire (ou mention 293 B), e-mail, téléphone, directeur de publication. Pages : mentions légales, CGV, contact, confidentialité.
- [ ] 🔴 Adhérer à un **médiateur de la consommation** (obligatoire, art. L612-1) et l'indiquer dans les mentions légales et les CGV.
- [ ] 🔴 Adresse de **retour en France** (page Livraison & retours).
- [ ] Faire relire les CGV, la confidentialité et la fonction de rétractation par un juriste. Vérifier en particulier :
  - la conformité de la page « Se rétracter du contrat ici » à la directive (UE) 2023/2673 (bouton de rétractation, applicable depuis le 19/06/2026) ; envisager une app dédiée ;
  - la reprise mot pour mot de l'encadré officiel sur la garantie légale de conformité (art. D211-2 C. conso).
- [ ] Déposer la marque **Flairou** après une recherche d'antériorité INPI + EUIPO (classes 18, 21, 28, 31).

## C. Réglages Shopify (manuels)
- [ ] 🔴 **Paiements** : activer Shopify Payments ou un autre prestataire (*Paramètres > Paiements*). Non fait volontairement.
- [ ] 🔴 **Frais de livraison** (*Paramètres > Expédition*) : zone France, 4,90 € en standard suivi, **gratuit dès 50 €**. Ce sont les tarifs affichés sur le site : ils doivent être identiques.
- [ ] 🔴 Devise **EUR**, langue principale **français**, pays France (le script vérifie et alerte sinon).
- [ ] 🔴 Taxes : prix TTC affichés, TVA FR 20 % (*Paramètres > Taxes et droits*).
- [ ] 🔴 **Bandeau cookies** : activer la bannière de confidentialité Shopify (*Paramètres > Confidentialité des clients*) pour l'UE.
- [ ] **Domaine** : acheter et connecter (ex. `flairou.fr`, disponibilité non vérifiée). Non fait volontairement.
- [ ] Notifications e-mail : expéditeur, logo, et un **accusé de réception de rétractation** (réponse au formulaire).
- [ ] Inscription à une filière REP (emballages) et identifiant unique à afficher : obligation des vendeurs en ligne qui mettent des emballages sur le marché français.

## D. Fournisseur
- [ ] 🔴 Choisir le fournisseur (entrepôt UE ou ligne express) et **obtenir un devis**. Le coût produit + port doit rester ≤ 9,30 € (Classique) et ≤ 11,63 € (Grand) pour garder 60 % de marge.
- [ ] 🔴 **Commander un échantillon** de chaque taille. Vérifier matières, dimensions, poids, solidité des franges, lavage à 30 °C. Corriger `content/product.json` (champs [À VÉRIFIER]), puis `node scripts/render-product-md.mjs` et `npm run deploy -- --only=product`.
- [ ] 🔴 **GPSR (règlement UE 2023/988)** : obtenir le nom et l'adresse du fabricant et une **personne responsable dans l'UE** ; compléter la fiche produit ; vérifier l'étiquetage du produit.
- [ ] Connecter l'app du fournisseur (DSers, CJ, etc.) et associer les 4 SKU : `FLR-TF-CLA-SAU`, `FLR-TF-CLA-SAB`, `FLR-TF-GRA-SAU`, `FLR-TF-GRA-SAB`.
- [ ] Confirmer le délai réel de livraison (< 15 jours) ; sinon ajuster les textes (FAQ, Livraison, CGV, bannière).
- [ ] Contrat de sous-traitance RGPD avec le fournisseur (il reçoit les adresses des clients), et clauses contractuelles types s'il est hors UE ; compléter la politique de confidentialité.

## E. Contenus
- [ ] 🔴 **Remplacer les 6 visuels provisoires** (`images/`) par de vraies photos de l'échantillon : 4 variantes en 1600×1600, bannière 2400×1100 et photo d'usage. Les retirer des Fichiers et du produit dans l'admin.
- [ ] Renseigner le coût unitaire réel de chaque variante (*Produit > Variante > Coût*) pour suivre la marge.
- [ ] Facultatif : réseaux sociaux dans le thème, e-mail de bienvenue de la newsletter.

## F. Test final
- [ ] 🔴 **Commande test** : activer la passerelle de test (Bogus Gateway) ou le mode test de Shopify Payments. Passer une commande, vérifier e-mails, taxes, frais de port, et l'aller-retour vers le fournisseur (sans expédition réelle), puis l'annuler et la rembourser.
- [ ] 🔴 Tester le formulaire « Se rétracter du contrat » et vérifier la réception de l'e-mail.
- [ ] Parcourir le site sur un vrai téléphone (iOS et Android).
- [ ] Retirer le mot de passe de la boutique (*Préférences > Accès à la boutique en ligne*) seulement quand tout ce qui précède est fait.
