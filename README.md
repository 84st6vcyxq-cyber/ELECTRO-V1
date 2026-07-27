# Le Mur — galerie photo + chat pour ta bande

PWA installable sur l'écran d'accueil iOS (et Android), avec :
- 🖼️ **Mur photo** partagé (upload depuis le téléphone, affichage façon polaroids punaisées)
- 💬 **Chat en direct** (style petits mots collés)
- 🔑 **Connexion sans mot de passe** : juste un prénom/pseudo, via l'authentification anonyme Firebase
- 100 % gratuit : hébergement sur **GitHub Pages** + back-end **Firebase** (offre gratuite "Spark")

Aucune étape de build : uniquement du HTML/CSS/JS natif (modules ES), donc rien à compiler.

```
├── index.html
├── manifest.json
├── sw.js                     ← service worker (installabilité + cache)
├── css/style.css
├── js/
│   ├── firebase-config.js    ← tu colles ta config Firebase ici
│   └── app.js
└── icons/                    ← icônes déjà générées (192, 512, maskable, apple-touch)
```

---

## 1. Créer le projet Firebase (gratuit)

1. Va sur [console.firebase.google.com](https://console.firebase.google.com) → **Ajouter un projet**.
2. Donne-lui un nom (ex. `le-mur-bande`), désactive Google Analytics (pas nécessaire), crée le projet.
3. Une fois dans le projet, clique l'icône **`</>`** ("Web") pour ajouter une application web.
   - Nom de l'app : `Le Mur` → **Enregistrer**.
   - Ne coche pas Firebase Hosting (on utilise GitHub Pages).
   - Firebase t'affiche un objet `firebaseConfig` — **garde cet écran ouvert**, tu en as besoin à l'étape 4.

## 2. Activer l'authentification anonyme

1. Menu de gauche → **Build → Authentication → Get started**.
2. Onglet **Sign-in method** → clique **Anonymous** → **Enable** → **Save**.

## 3. Créer Firestore (base de données du chat + des photos)

1. Menu de gauche → **Build → Firestore Database → Create database**.
2. Choisis **Start in production mode** (les règles ci-dessous sécurisent tout), puis une région proche de vous (ex. `eur3 (europe-west)`).
3. Une fois créée, va dans l'onglet **Rules**, remplace tout le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /photos/{photoId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.authorUid == request.auth.uid;
      allow delete: if request.auth != null
                    && resource.data.authorUid == request.auth.uid;
      allow update: if false;
    }

    match /messages/{messageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.authorUid == request.auth.uid
                    && request.resource.data.text is string
                    && request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 500;
      allow update, delete: if false;
    }
  }
}
```

4. **Publish**.

## 4. Créer Storage (stockage des photos)

1. Menu de gauche → **Build → Storage → Get started** → garde les valeurs par défaut → **Done**.
2. Onglet **Rules**, remplace par :

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{uid}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 15 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

3. **Publish**.

> ℹ️ Ces règles limitent chacun à lire/écrire les données du groupe une fois connecté (anonymement), à ne supprimer que ses propres photos, et à uploader uniquement des images de moins de 15 Mo.

## 5. Coller ta config dans le projet

1. Retourne dans **Project settings** (⚙️ en haut à gauche) → onglet **General** → section **Your apps**, copie l'objet `firebaseConfig`.
2. Ouvre `js/firebase-config.js` et remplace les valeurs `REMPLACE_MOI` par les tiennes :

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "le-mur-bande.firebaseapp.com",
  projectId: "le-mur-bande",
  storageBucket: "le-mur-bande.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

Cette clé `apiKey` n'est **pas un secret** : elle identifie ton projet publiquement, la vraie sécurité vient des règles Firestore/Storage définies plus haut.

---

## 6. Déployer sur GitHub Pages

1. Crée un nouveau dépôt GitHub (public ou privé, ex. `le-mur`).
2. Mets tous les fichiers de ce dossier à la racine du dépôt (ou dans un dossier `docs/`, au choix).
3. Depuis ton terminal, à la racine du projet :

```bash
git init
git add .
git commit -m "Le Mur — v1"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/le-mur.git
git push -u origin main
```

4. Sur GitHub : **Settings → Pages**.
   - **Source** : `Deploy from a branch`.
   - **Branch** : `main` / dossier `/ (root)` (ou `/docs` selon ton choix) → **Save**.
5. Attends 1-2 minutes, l'URL apparaît en haut de la page (ex. `https://ton-compte.github.io/le-mur/`).

> ⚠️ Si le dépôt n'est pas à la racine (`https://ton-compte.github.io/le-mur/`), toutes les URLs du projet doivent rester **relatives** (`./css/style.css`, `./js/app.js`, etc.) — c'est déjà le cas dans tous les fichiers fournis, tu n'as rien à changer.

## 7. Autoriser ton domaine GitHub Pages dans Firebase

1. Firebase console → **Authentication → Settings → Authorized domains → Add domain**.
2. Ajoute `ton-compte.github.io`.

## 8. Ajouter à l'écran d'accueil (iOS)

1. Ouvre l'URL GitHub Pages dans **Safari** sur iPhone.
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. L'app s'ouvre en plein écran, sans barre Safari, avec sa propre icône punaise/polaroid.

Sur Android/Chrome, une bannière "Ajouter à l'écran d'accueil" apparaît automatiquement (ou menu ⋮ → Installer l'application).

---

## Tester en local avant de déployer

Les modules ES nécessitent un vrai serveur (pas `file://`). Depuis le dossier du projet :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Mettre à jour l'app après déploiement

Le service worker met le "coffrage" de l'app en cache pour un chargement instantané / hors-ligne. Après chaque modification de fichiers, incrémente le numéro de version en haut de `sw.js` :

```js
const CACHE_NAME = "le-mur-shell-v2"; // v1 → v2, etc.
```

Sinon les téléphones qui ont déjà installé l'app garderont l'ancienne version en cache.

## Aller plus loin (idées pour une v2)

- Légendes de photo, réactions ❤️ sur les messages et les photos
- Notifications push (Firebase Cloud Messaging)
- Miniatures compressées côté client avant upload (plus rapide, moins de quota Storage)
- Suppression/modification des messages, galerie par albums/événements

## Limites du forfait gratuit Firebase (Spark)

Largement suffisant pour un groupe d'amis : 1 Go de stockage Firestore, 5 Go de fichiers Storage, 10 Go de bande passante réseau/mois, authentification illimitée. Si le groupe grandit beaucoup, tu ne payes que si tu dépasses ces quotas (compte Google à ajouter pour passer au forfait *Blaze*, mais un usage entre amis n'a normalement pas besoin d'y toucher).
