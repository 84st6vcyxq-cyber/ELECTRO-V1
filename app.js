import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ---------------------------------------------------------------
// Setup
// ---------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const LS_NAME_KEY = "lemur_display_name";
let currentUid = null;
let currentName = null;
let isRenaming = false;
let unsubGallery = null;
let unsubChat = null;

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const loginScreen = $("login-screen");
const loginForm = $("login-form");
const nameInput = $("displayName");
const loginBtn = $("login-btn");
const loginError = $("login-error");

const appShell = $("app");
const whoamiBtn = $("whoami-btn");
const whoamiInitial = $("whoami-initial");
const whoamiName = $("whoami-name");

const tabGallery = $("tab-gallery");
const tabChat = $("tab-chat");
const viewGallery = $("view-gallery");
const viewChat = $("view-chat");

const galleryGrid = $("gallery-grid");
const galleryEmpty = $("gallery-empty");

const chatThread = $("chat-thread");
const chatEmpty = $("chat-empty");
const chatForm = $("chat-form");
const chatInput = $("chat-input");

const addPhotoBtn = $("add-photo-btn");
const photoInput = $("photo-input");

const uploadToast = $("upload-toast");
const uploadToastFill = $("upload-toast-fill");
const uploadToastLabel = $("upload-toast-label");

const lightbox = $("lightbox");
const lightboxImg = $("lightbox-img");
const lightboxAuthor = $("lightbox-author");
const lightboxDate = $("lightbox-date");
const lightboxClose = $("lightbox-close");
const lightboxDelete = $("lightbox-delete");

const toastEl = $("toast");

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------
function showToast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.hidden = true), ms);
}

function initialOf(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function formatWhen(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " · " + time;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Auth / identity flow
// ---------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // No session yet — wait for the login form submit to sign in.
    return;
  }
  currentUid = user.uid;

  if (isRenaming) return; // user explicitly opened the rename screen, don't auto-skip it

  const snap = await getDoc(doc(db, "users", user.uid));
  const savedName = snap.exists() ? snap.data().displayName : localStorage.getItem(LS_NAME_KEY);

  if (savedName) {
    currentName = savedName;
    localStorage.setItem(LS_NAME_KEY, savedName);
    enterApp();
  }
  // else: stay on the login screen and let the user pick a name
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  setLoginLoading(true);
  loginError.hidden = true;
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    const uid = auth.currentUser.uid;
    await setDoc(doc(db, "users", uid), { displayName: name, updatedAt: serverTimestamp() }, { merge: true });
    currentUid = uid;
    currentName = name;
    localStorage.setItem(LS_NAME_KEY, name);
    isRenaming = false;
    enterApp();
  } catch (err) {
    console.error(err);
    loginError.textContent = "Connexion impossible. Vérifie ta connexion internet et réessaie.";
    loginError.hidden = false;
  } finally {
    setLoginLoading(false);
  }
});

function setLoginLoading(loading) {
  loginBtn.disabled = loading;
  loginBtn.querySelector(".btn-label").hidden = loading;
  loginBtn.querySelector(".btn-spinner").hidden = !loading;
}

whoamiBtn.addEventListener("click", () => {
  isRenaming = true;
  nameInput.value = currentName || "";
  appShell.hidden = true;
  loginScreen.hidden = false;
  nameInput.focus();
});

function enterApp() {
  loginScreen.hidden = true;
  appShell.hidden = false;
  whoamiInitial.textContent = initialOf(currentName);
  whoamiName.textContent = currentName;
  startGalleryListener();
  startChatListener();
}

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------
function setView(view) {
  const isGallery = view === "gallery";
  viewGallery.hidden = !isGallery;
  viewChat.hidden = isGallery;
  tabGallery.classList.toggle("is-active", isGallery);
  tabChat.classList.toggle("is-active", !isGallery);
  tabGallery.setAttribute("aria-selected", String(isGallery));
  tabChat.setAttribute("aria-selected", String(!isGallery));
  addPhotoBtn.style.display = isGallery ? "grid" : "none";
  if (!isGallery) chatThread.scrollTop = chatThread.scrollHeight;
}
tabGallery.addEventListener("click", () => setView("gallery"));
tabChat.addEventListener("click", () => setView("chat"));

// ---------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------
function startGalleryListener() {
  if (unsubGallery) return;
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"), limit(60));
  unsubGallery = onSnapshot(
    q,
    (snap) => {
      galleryGrid.innerHTML = "";
      galleryEmpty.hidden = !snap.empty ? true : false;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        galleryGrid.appendChild(renderPolaroid(docSnap.id, data));
      });
    },
    (err) => {
      console.error(err);
      showToast("Impossible de charger la galerie.");
    }
  );
}

function renderPolaroid(id, data) {
  const el = document.createElement("figure");
  el.className = "polaroid";
  el.innerHTML = `
    <img src="${data.url}" alt="Photo ajoutée par ${escapeHtml(data.authorName || "quelqu'un")}" loading="lazy" />
    <figcaption class="polaroid-caption">${escapeHtml(data.authorName || "?")}</figcaption>
  `;
  el.addEventListener("click", () => openLightbox(id, data));
  return el;
}

addPhotoBtn.addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Merci de choisir une image.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("Cette image dépasse 15 Mo.");
    return;
  }
  await uploadPhoto(file);
});

async function uploadPhoto(file) {
  const uid = currentUid;
  const path = `photos/${uid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  uploadToast.hidden = false;
  uploadToastLabel.textContent = "Envoi de la photo…";
  uploadToastFill.style.width = "0%";

  task.on(
    "state_changed",
    (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      uploadToastFill.style.width = pct + "%";
    },
    (err) => {
      console.error(err);
      uploadToast.hidden = true;
      showToast("L'envoi a échoué. Réessaie.");
    },
    async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "photos"), {
          url,
          storagePath: path,
          authorUid: uid,
          authorName: currentName,
          createdAt: serverTimestamp(),
        });
        showToast("Photo punaisée ✨");
      } catch (err) {
        console.error(err);
        showToast("Photo envoyée mais non enregistrée. Réessaie.");
      } finally {
        uploadToast.hidden = true;
      }
    }
  );
}

// ---------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------
let activePhoto = null;

function openLightbox(id, data) {
  activePhoto = { id, ...data };
  lightboxImg.src = data.url;
  lightboxImg.alt = `Photo ajoutée par ${data.authorName || "quelqu'un"}`;
  lightboxAuthor.textContent = data.authorName || "?";
  lightboxDate.textContent = formatWhen(data.createdAt);
  lightboxDelete.hidden = data.authorUid !== currentUid;
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = "";
  activePhoto = null;
}
lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightboxDelete.addEventListener("click", async () => {
  if (!activePhoto) return;
  const { id, storagePath } = activePhoto;
  lightboxDelete.disabled = true;
  try {
    await deleteDoc(doc(db, "photos", id));
    if (storagePath) {
      try { await deleteObject(ref(storage, storagePath)); } catch (e) { /* ignore if already gone */ }
    }
    showToast("Photo retirée.");
    closeLightbox();
  } catch (err) {
    console.error(err);
    showToast("Impossible de retirer la photo.");
  } finally {
    lightboxDelete.disabled = false;
  }
});

// ---------------------------------------------------------------
// Chat
// ---------------------------------------------------------------
function startChatListener() {
  if (unsubChat) return;
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(300));
  unsubChat = onSnapshot(
    q,
    (snap) => {
      chatThread.innerHTML = "";
      chatEmpty.hidden = !snap.empty;
      snap.forEach((docSnap) => {
        chatThread.appendChild(renderNote(docSnap.data()));
      });
      chatThread.scrollTop = chatThread.scrollHeight;
    },
    (err) => {
      console.error(err);
      showToast("Impossible de charger le chat.");
    }
  );
}

function renderNote(data) {
  const el = document.createElement("div");
  const mine = data.authorUid === currentUid;
  el.className = "note" + (mine ? " note--me" : "");
  el.innerHTML = `
    ${mine ? "" : `<div class="note-author">${escapeHtml(data.authorName || "?")}</div>`}
    <div class="note-text">${escapeHtml(data.text || "")}</div>
    <span class="note-time">${formatWhen(data.createdAt)}</span>
  `;
  return el;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  try {
    await addDoc(collection(db, "messages"), {
      text,
      authorUid: currentUid,
      authorName: currentName,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    showToast("Message non envoyé. Réessaie.");
    chatInput.value = text;
  }
});

// ---------------------------------------------------------------
// Service worker (offline shell + installability)
// ---------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
  });
}
