#!/usr/bin/env node
// Génère PRODUCT.md (fiche produit lisible) à partir de content/product.json — source unique.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './lib/content.mjs';
const p = readJson('content/product.json');
const eur = (s) => s.replace('.', ',') + ' €';
const md = `# Fiche produit — ${p.title}

> Fichier généré par \`node scripts/render-product-md.mjs\` depuis \`content/product.json\` (source unique). Ne pas éditer à la main.

| Champ | Valeur |
|---|---|
| Titre SEO (H1) | ${p.title} |
| Handle / URL | \`/products/${p.handle}\` |
| Meta title (${p.seo.title.length} car.) | ${p.seo.title} |
| Meta description (${p.seo.description.length} car.) | ${p.seo.description} |
| Marque (vendor) | ${p.vendor} |
| Type | ${p.productType} |
| Collection | ${p.collection.title} (\`/collections/${p.collection.handle}\`) |
| Tags | ${p.tags.join(', ')} |
| Prix barré | ${p.compareAtPriceNote} |

## Variantes

| Taille | Couleur | Prix TTC | SKU | Poids | Visuel |
|---|---|---|---|---|---|
${p.variants.map((v) => `| ${v.options.Taille} | ${v.options.Couleur} | ${eur(v.price)} | \`${v.sku}\` | ${v.weightGrams} g | \`images/${v.image}\` |`).join('\n')}

Stock : non suivi (dropshipping), donc **aucun compteur de stock n'est affiché**.

## Description (orientée bénéfices)

${p.intro.join('\n\n')}

## 5 points forts

${p.bullets.map((b) => `- ${b}`).join('\n')}

## Comment ça marche

${p.howTo.map((b, i) => `${i + 1}. ${b}`).join('\n')}

## Caractéristiques

${p.specs.map(([k, v]) => `- **${k}** : ${v}`).join('\n')}

## Sécurité et informations produit (GPSR)

${p.safety.warnings.map((w) => `- ${w}`).join('\n')}
- Fabricant : ${p.safety.manufacturer}
- Personne responsable UE : ${p.safety.euResponsible}

## FAQ (6 questions)

${p.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}

## Règles éditoriales appliquées
- Aucun faux avis, aucune note étoilée, aucun faux compteur de stock ou de visiteurs, aucun compte à rebours.
- Aucune allégation de santé ou de comportement (anxiété, stress, recommandation vétérinaire…) : les bénéfices décrits découlent directement du fonctionnement du produit.
- Le prix barré n'est affiché que s'il correspond à un prix antérieur réellement pratiqué : il n'y en a pas au lancement.
`;
fs.writeFileSync(path.join(ROOT, 'PRODUCT.md'), md);
console.log('PRODUCT.md généré');
