# Journal de bord

Application web installable sur iPhone / iPad (PWA) : journal personnel, carte du monde, photos et notes.
Les données sont enregistrées sur l'appareil (fonctionne hors ligne) et synchronisées dans **un dépôt GitHub privé**.

## Fonctionnalités

- **Journal** : entrées datées avec titre, texte, humeur, étiquettes, photos et position GPS facultative. Classement par mois et recherche.
- **Carte** : carte du monde (OpenStreetMap). Touche la carte, cherche une adresse ou utilise « Ma position » pour enregistrer un lieu avec notes et photos. Les entrées de journal géolocalisées apparaissent aussi (points bleus).
- **Notes** : notes libres avec étiquettes et photos.
- **Synchronisation GitHub** : automatique après chaque modification et au démarrage, ou via le bouton ⟳. Fonctionne entre plusieurs appareils.
- **Hors ligne** : l'application s'ouvre sans réseau. La synchro reprend au retour de la connexion.

## Mise en route

### 1. Héberger l'application
Le plus simple est GitHub Pages sur ce dépôt : *Settings → Pages → Deploy from a branch → `main` / root*.
L'app sera disponible à `https://<pseudo>.github.io/<nom-du-depot>/`.

> ⚠️ Avec un compte GitHub gratuit, Pages exige un dépôt **public**. C'est sans risque ici, car ce dépôt ne contient que le code. Tes données vont dans un **autre dépôt, privé**.

### 2. Créer le dépôt de données
Crée un dépôt **privé** vide, par exemple `journal-data`, en cochant « Add a README » pour qu'il ait une branche `main`.

### 3. Créer un jeton d'accès
GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token* :
- *Repository access* : **Only select repositories** → `journal-data`
- *Permissions → Repository permissions → Contents* : **Read and write**

### 4. Configurer l'app
Ouvre l'app dans Safari, onglet **Réglages** : propriétaire (ton pseudo), dépôt (`journal-data`), jeton → **Tester** puis **Enregistrer**.
Puis installe-la : bouton Partager → **Sur l'écran d'accueil**.

## Organisation des données dans le dépôt

```
data/journal.json        toutes les entrées, lieux et notes
data/photos/<id>.jpg     photos (redimensionnées à 1600 px max)
```

## Structure du code

```
index.html          interface (onglets Journal, Carte, Notes, Réglages)
style.css           style inspiré d'iOS, mode sombre automatique
js/app.js           logique de l'interface, carte, éditeur
js/db.js            stockage local (IndexedDB)
js/sync.js          fusion et synchronisation
js/github.js        appels à l'API GitHub
sw.js               cache hors ligne
vendor/leaflet/     bibliothèque de carte Leaflet 1.9.4 (licence BSD-2)
```

Aucune étape de compilation : ce sont des fichiers statiques.
Pour tester en local : `python3 -m http.server` puis ouvre http://localhost:8000.
