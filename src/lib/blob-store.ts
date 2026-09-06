/**
 * Stockage BINAIRE local des pièces — IndexedDB.
 *
 * Pourquoi ni `localStorage` ni l'`AppState` : l'état applicatif est sérialisé en UN seul JSON
 * (localStorage ~5 Mo ; une ligne JSONB côté Supabase). Y loger des PDF encodés en base64 ferait
 * exploser le quota du navigateur et la synchronisation cloud à la première dizaine de documents.
 *
 * Le partage est donc scindé, volontairement :
 *  - les MÉTADONNÉES (qui, quoi, quand, taille, empreinte) vivent dans l'`AppState` — elles
 *    suivent la synchronisation Supabase, tout poste sait donc qu'une pièce existe ;
 *  - le BINAIRE vit ici, sur le poste qui l'a déposé.
 *
 * Limite assumée, affichée à l'utilisateur : un fichier déposé sur un poste n'est pas
 * téléchargeable depuis un autre. Le jour où l'on branche Supabase Storage, seul CE module
 * change — les appelants gardent la même API.
 */

const DB_NAME = "gca-paie-blobs";
const DB_VERSION = 1;
const STORE = "blobs";

/** Enregistrement stocké : le binaire + le strict nécessaire pour le restituer. */
interface BlobRecord {
  id: string;
  blob: Blob;
  mime: string;
  filename: string;
  at: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible dans ce navigateur."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Ouverture IndexedDB refusée."));
  });
  // Un échec ne doit pas figer les tentatives suivantes (mode privé, quota, onglet concurrent).
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Opération IndexedDB refusée."));
      }),
  );
}

/** Le stockage binaire est-il utilisable ici ? (faux en mode privé strict, ou navigateur bridé). */
export async function isBlobStoreAvailable(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

/** Enregistre (ou remplace) un binaire sous `id`. */
export async function putBinary(id: string, blob: Blob, filename: string): Promise<void> {
  const rec: BlobRecord = { id, blob, mime: blob.type || "application/octet-stream", filename, at: new Date().toISOString() };
  await tx("readwrite", (st) => st.put(rec) as IDBRequest<IDBValidKey>);
}

/** Relit un binaire. `null` si absent (déposé depuis un autre poste, ou purgé). */
export async function getBinary(id: string): Promise<{ blob: Blob; filename: string } | null> {
  try {
    const rec = await tx<BlobRecord | undefined>("readonly", (st) => st.get(id) as IDBRequest<BlobRecord | undefined>);
    return rec ? { blob: rec.blob, filename: rec.filename } : null;
  } catch {
    return null;
  }
}

/** Supprime un binaire. Silencieux s'il n'existe pas. */
export async function deleteBinary(id: string): Promise<void> {
  try {
    await tx("readwrite", (st) => st.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* rien à supprimer / stockage indisponible */
  }
}

/** Identifiants réellement présents SUR CE POSTE — sert à distinguer « absent » de « ailleurs ». */
export async function localBinaryIds(): Promise<Set<string>> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (st) => st.getAllKeys() as IDBRequest<IDBValidKey[]>);
    return new Set(keys.map(String));
  } catch {
    return new Set();
  }
}

/**
 * Déclenche le téléchargement du binaire `id` sous `filename`. Renvoie `false` si le fichier
 * n'est pas présent sur ce poste — l'appelant affiche alors un message, jamais un fichier vide.
 */
export async function downloadBinary(id: string, filename?: string): Promise<boolean> {
  const found = await getBinary(id);
  if (!found) return false;
  const url = URL.createObjectURL(found.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || found.filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse au navigateur le temps d'amorcer le téléchargement avant de révoquer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

/** Ouvre le binaire dans un nouvel onglet (aperçu PDF / image). Faux s'il est absent du poste. */
export async function openBinary(id: string): Promise<boolean> {
  const found = await getBinary(id);
  if (!found) return false;
  const url = URL.createObjectURL(found.blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
