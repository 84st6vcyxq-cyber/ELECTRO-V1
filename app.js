// ========== Mini store Favoris (simple & robuste) ==========
const FAV_KEY = "em_favoris_v1";
const fav = {
  getAll() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); }
    catch { return []; }
  },
  has(id) { return fav.getAll().includes(id); },
  toggle(id) {
    const all = new Set(fav.getAll());
    all.has(id) ? all.delete(id) : all.add(id);
    localStorage.setItem(FAV_KEY, JSON.stringify([...all]));
  }
};

// ========== Données de base (tu pourras les étendre) ==========
const data = {
  outils: [
    { id:"elec_tri", label:"Puissance triphasée", icon:"⚡", route:"#/elec/tri", tags:["électrique","tri","puissance","cosphi"] },
    { id:"meca_pas", label:"Pas de vis ISO", icon:"🔧", route:"#/meca/pasdevis", tags:["mécanique","pas de vis","filetage","iso"] }
  ],
  pasDeVisISO: [
    { ref:"M3",  pas:"0,5",  pasFin:"0,35",  foret:"2,5",  cle:"5,5" },
    { ref:"M4",  pas:"0,7",  pasFin:"0,5",   foret:"3,3",  cle:"7" },
    { ref:"M5",  pas:"0,8",  pasFin:"0,5",   foret:"4,2",  cle:"8" },
    { ref:"M6",  pas:"1,0",  pasFin:"0,75",  foret:"5,0",  cle:"10" },
    { ref:"M8",  pas:"1,25", pasFin:"1,0",   foret:"6,8",  cle:"13" },
    { ref:"M10", pas:"1,5",  pasFin:"1,25",  foret:"8,5",  cle:"17" },
    { ref:"M12", pas:"1,75", pasFin:"1,5",   foret:"10,2", cle:"19" },
    { ref:"M16", pas:"2,0",  pasFin:"1,5",   foret:"14,0", cle:"24" },
    { ref:"M20", pas:"2,5",  pasFin:"2,0",   foret:"17,5", cle:"30" },
    { ref:"M24", pas:"3,0",  pasFin:"2,0",   foret:"21,0", cle:"36" }
  ]
};

// ========== Helpers UI ==========
const $app = document.getElementById("app");

function setActiveTab() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".tab").forEach(a => a.classList.remove("active"));
  if (hash.startsWith("#/favoris")) document.querySelectorAll(".tab")[1].classList.add("active");
  else if (hash.startsWith("#/search")) document.querySelectorAll(".tab")[2].classList.add("active");
  else document.querySelectorAll(".tab")[0].classList.add("active");
}

function html(strings, ...values) {
  return strings.map((s, i) => s + (values[i] ?? "")).join("");
}

function favButton(id){
  const on = fav.has(id);
  return html`
    <button class="btn ${on ? "btn--primary" : ""}" data-fav="${id}">
      ${on ? "⭐ En favori" : "☆ Ajouter favori"}
    </button>
  `;
}

function bindFavButtons(){
  document.querySelectorAll("[data-fav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-fav");
      fav.toggle(id);
      render(); // refresh
    });
  });
}

// ========== Pages ==========
function pageHome(){
  return html`
    <div class="h1">Menu principal</div>
    <div class="grid">
      <a class="tile" href="#/elec">
        <div class="tile__icon">⚡</div>
        <div>
          <div class="tile__title">Électrique</div>
          <div class="tile__desc">Puissances, conversions, repères terrain.</div>
        </div>
      </a>

      <a class="tile" href="#/meca">
        <div class="tile__icon">🔧</div>
        <div>
          <div class="tile__title">Mécanique</div>
          <div class="tile__desc">Pas de vis, couples, roulements…</div>
        </div>
      </a>

      <a class="tile" href="#/auto">
        <div class="tile__icon">🤖</div>
        <div>
          <div class="tile__title">Automatisme</div>
          <div class="tile__desc">Checklists diag, codes défaut (bientôt).</div>
        </div>
      </a>

      <a class="tile" href="#/docs">
        <div class="tile__icon">📚</div>
        <div>
          <div class="tile__title">Dépannage</div>
          <div class="tile__desc">Fiches + solutions rapides (bientôt).</div>
        </div>
      </a>
    </div>

    <div class="spacer"></div>
    <div class="card">
      <div class="h2">Accès rapide</div>
      <div class="row">
        <a class="btn btn--primary" href="#/elec/tri">⚡ Puissance tri</a>
        <a class="btn btn--primary" href="#/meca/pasdevis">🔧 Pas de vis</a>
        <a class="btn" href="#/favoris">⭐ Favoris</a>
      </div>
      <div class="p">Astuce : ajoute l’app à l’écran d’accueil pour un usage “terrain”.</div>
    </div>
  `;
}

function pageElec(){
  return html`
    <div class="h1">⚡ Électrique</div>
    <div class="card">
      <div class="h2">Outils</div>
      <div class="row">
        <a class="btn btn--primary" href="#/elec/tri">Calcul puissance triphasée</a>
      </div>
      <div class="p">Prochainement : Loi d’Ohm, sections de câbles, conversions, etc.</div>
    </div>
  `;
}

function pageElecTri(){
  return html`
    <div class="h1">⚡ Puissance triphasée</div>

    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="badge">Formule : √3 × U × I × cosφ</div>
        ${favButton("elec_tri")}
      </div>

      <div class="spacer"></div>

      <label class="p">Tension U (V)</label>
      <input class="input" id="u" type="number" inputmode="decimal" placeholder="Ex : 400" value="400">

      <div class="spacer"></div>

      <label class="p">Courant I (A)</label>
      <input class="input" id="i" type="number" inputmode="decimal" placeholder="Ex : 12">

      <div class="spacer"></div>

      <label class="p">cosφ</label>
      <input class="input" id="cos" type="number" inputmode="decimal" step="0.01" placeholder="Ex : 0,85" value="0.85">

      <div class="spacer"></div>

      <div class="row">
        <button class="btn btn--primary" id="calc">Calculer</button>
        <button class="btn" id="reset">Réinitialiser</button>
      </div>

      <div class="spacer"></div>

      <div class="kpi">
        <div class="card">
          <div class="kpi__label">Puissance active</div>
          <div class="kpi__value" id="pkw">— kW</div>
        </div>
        <div class="card">
          <div class="kpi__label">Puissance apparente</div>
          <div class="kpi__value" id="skva">— kVA</div>
        </div>
      </div>

      <div class="p">Note : résultat indicatif “terrain”. Pour moteurs/variateurs, pense au rendement η si besoin.</div>
    </div>
  `;
}

function pageMeca(){
  return html`
    <div class="h1">🔧 Mécanique</div>
    <div class="card">
      <div class="h2">Outils</div>
      <div class="row">
        <a class="btn btn--primary" href="#/meca/pasdevis">Pas de vis ISO (métrique)</a>
      </div>
      <div class="p">Prochainement : couples de serrage, roulements, conversions N·m/daN·m…</div>
    </div>
  `;
}

function pageMecaPasDeVis(){
  return html`
    <div class="h1">🔧 Pas de vis ISO</div>

    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="badge">Recherche instantanée</div>
        ${favButton("meca_pas")}
      </div>

      <div class="spacer"></div>

      <input class="input" id="q" type="search" placeholder="Tape : M6, M8, pas fin, 1,25…" />

      <div class="spacer"></div>

      <table class="table" aria-label="Table pas de vis ISO">
        <thead>
          <tr>
            <th>Filetage</th>
            <th>Pas standard (mm)</th>
            <th>Pas fin (mm)</th>
            <th>Foret taraudage (mm)</th>
            <th>Clé (mm)</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>

      <div class="p">Tu veux : UNC/UNF, gaz BSP, ou encore les tolérances ? On peut ajouter des onglets.</div>
    </div>
  `;
}

function pageAuto(){
  return html`
    <div class="h1">🤖 Automatisme</div>
    <div class="card">
      <div class="h2">Bientôt</div>
      <div class="p">Ici on mettra : checklists diag, codes défaut variateurs/PLC, notes par machine, etc.</div>
      <div class="spacer"></div>
      <div class="badge">Prochaine brique recommandée : Fiches dépannage + Recherche globale</div>
    </div>
  `;
}

function pageDocs(){
  return html`
    <div class="h1">📚 Dépannage</div>
    <div class="card">
      <div class="hC2">
        <div class="h2">Bientôt</div>
        <div class="p">Objectif : créer tes fiches “panne → symptômes → causes → tests → solution” avec recherche et favoris.</div>
        <div class="spacer"></div>
        <div class="badge">On ajoutera un stockage local (IndexedDB)</div>
      </div>
    </div>
  `;
}

function pageFavoris(){
  const ids = fav.getAll();
  const items = data.outils.filter(o => ids.includes(o.id));
  return html`
    <div class="h1">⭐ Favoris</div>
    <div class="card">
      ${items.length ? html`
        <div class="h2">Tes outils favoris</div>
        <div class="row">
          ${items.map(o => html`<a class="btn btn--primary" href="${o.route}">${o.icon} ${o.label}</a>`).join("")}
        </div>
      ` : html`
        <div class="h2">Aucun favori</div>
        <div class="p">Ajoute un favori depuis un outil (bouton ☆ / ⭐).</div>
      `}
      <div class="spacer"></div>
      <button class="btn btn--danger" id="clearFav">🗑️ Effacer les favoris</button>
    </div>
  `;
}

function pageSearch(){
  return html`
    <div class="h1">🔎 Recherche</div>
    <div class="card">
      <input class="input" id="searchAll" type="search" placeholder="Ex : tri, pas de vis, M12, puissance…" />
      <div class="spacer"></div>
      <div id="searchResults" class="row"></div>
      <div class="p">La recherche s’étendra ensuite aux fiches dépannage.</div>
    </div>
  `;
}

// ========== Router ==========
function render(){
  const route = (location.hash || "#/").replace("#", "");
  setActiveTab();

  document.getElementById("btnHome").onclick = () => (location.hash = "#/");

  let view = "";
  if (route === "/") view = pageHome();
  else if (route === "/elec") view = pageElec();
  else if (route === "/elec/tri") view = pageElecTri();
  else if (route === "/meca") view = pageMeca();
  else if (route === "/meca/pasdevis") view = pageMecaPasDeVis();
  else if (route === "/auto") view = pageAuto();
  else if (route === "/docs") view = pageDocs();
  else if (route === "/favoris") view = pageFavoris();
  else if (route === "/search") view = pageSearch();
  else view = html`<div class="h1">Introuvable</div><div class="card"><div class="p">Cette page n'existe pas.</div></div>`;

  $app.innerHTML = view;

  bindFavButtons();

  if (route === "/elec/tri") bindElecTri();
  if (route === "/meca/pasdevis") bindPasDeVis();
  if (route === "/favoris") {
    const btn = document.getElementById("clearFav");
    btn?.addEventListener("click", () => { localStorage.removeItem(FAV_KEY); render(); });
  }
  if (route === "/search") bindSearch();
}

function bindElecTri(){
  const u = document.getElementById("u");
  const i = document.getElementById("i");
  const cos = document.getElementById("cos");
  const pkw = document.getElementById("pkw");
  const skva = document.getElementById("skva");

  function calc(){
    const U = Number(u.value);
    const I = Number(i.value);
    const C = Number(cos.value);
    if (!U || !I || !C) {
      pkw.textContent = "— kW";
      skva.textContent = "— kVA";
      return;
    }
    const S_kVA = (Math.sqrt(3) * U * I) / 1000;
    const P_kW = S_kVA * C;
    skva.textContent = `${S_kVA.toFixed(2)} kVA`;
    pkw.textContent  = `${P_kW.toFixed(2)} kW`;
  }

  document.getElementById("calc").addEventListener("click", calc);
  document.getElementById("reset").addEventListener("click", () => {
    u.value = 400;
    i.value = "";
    cos.value = 0.85;
    calc();
  });

  [u,i,cos].forEach(el => el.addEventListener("input", calc));
  calc();
}

function bindPasDeVis(){
  const rows = document.getElementById("rows");
  const q = document.getElementById("q");

  function renderRows(filter=""){
    const f = filter.trim().toLowerCase().replace(",", ".");
    const list = data.pasDeVisISO.filter(r => {
      const hay = `${r.ref} ${r.pas} ${r.pasFin} ${r.foret} ${r.cle}`.toLowerCase().replace(",", ".");
      return !f || hay.includes(f);
    });

    rows.innerHTML = list.map(r => html`
      <tr>
        <td><b>${r.ref}</b></td>
        <td>${r.pas}</td>
        <td>${r.pasFin}</td>
        <td>${r.foret}</td>
        <td>${r.cle}</td>
      </tr>
    `).join("");
  }

  q.addEventListener("input", () => renderRows(q.value));
  renderRows();
}

function bindSearch(){
  const input = document.getElementById("searchAll");
  const out = document.getElementById("searchResults");

  function run(){
    const q = input.value.trim().toLowerCase();
    const results = data.outils.filter(o =>
      !q || o.label.toLowerCase().includes(q) || o.tags.some(t => t.includes(q))
    );

    out.innerHTML = results.length
      ? results.map(o => `<a class="btn btn--primary" href="${o.route}">${o.icon} ${o.label}</a>`).join("")
      : `<span class="p">Aucun résultat.</span>`;
  }

  input.addEventListener("input", run);
  run();
}

// ========== PWA register ==========
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

window.addEventListener("hashchange", render);
render();
