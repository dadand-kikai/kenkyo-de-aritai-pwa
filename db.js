const DB_NAME = "kenkyo-de-aritai";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("answers")) db.createObjectStore("answers", { keyPath: "date" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = action(store);
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function getAnswers() {
  const rows = await request("answers", "readonly", (store) => store.getAll());
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveAnswer(row) {
  return request("answers", "readwrite", (store) => store.put(row));
}

export function getSetting(key) {
  return request("settings", "readonly", (store) => store.get(key)).then((row) => row?.value);
}

export function setSetting(key, value) {
  return request("settings", "readwrite", (store) => store.put({ key, value }));
}

export async function replaceAnswers(rows) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("answers", "readwrite");
    const store = tx.objectStore("answers");
    store.clear();
    rows.forEach((row) => store.put(row));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAllData() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["answers", "settings"], "readwrite");
    tx.objectStore("answers").clear();
    tx.objectStore("settings").clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
