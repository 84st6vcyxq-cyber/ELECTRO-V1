// Construction des contenus (HTML produit, pages) à partir des fichiers de ./content
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function productDescriptionHtml(p) {
  const out = [];
  out.push(...p.intro.map((t) => `<p>${esc(t)}</p>`));
  out.push('<h3>Pourquoi vous allez l\'adopter</h3>');
  out.push('<ul>' + p.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>');
  out.push('<h3>Comment ça marche</h3>');
  out.push('<ol>' + p.howTo.map((b) => `<li>${esc(b)}</li>`).join('') + '</ol>');
  out.push('<h3>Caractéristiques</h3>');
  out.push('<table><tbody>' + p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</tbody></table>');
  out.push('<h3>Sécurité et informations produit</h3>');
  out.push('<ul>' + p.safety.warnings.map((w) => `<li>${esc(w)}</li>`).join('') + '</ul>');
  out.push(`<p><strong>Fabricant :</strong> ${esc(p.safety.manufacturer)}<br><strong>Personne responsable dans l'UE :</strong> ${esc(p.safety.euResponsible)}<br>${esc(p.safety.reference)}</p>`);
  out.push('<h3>Questions fréquentes</h3>');
  out.push(p.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join(''));
  return out.join('\n');
}

// Pages : content/pages/<handle>.html, la 1re ligne est un commentaire de métadonnées JSON
export function loadPages() {
  const dir = path.join(ROOT, 'content', 'pages');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort().map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = raw.match(/^<!--\s*(\{.*?\})\s*-->\s*/s);
    if (!m) throw new Error(`Métadonnées manquantes dans ${f}`);
    const meta = JSON.parse(m[1]);
    return { handle: f.replace(/\.html$/, ''), body: raw.slice(m[0].length).trim(), ...meta };
  });
}
