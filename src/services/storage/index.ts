
const DB_NAME = 'NanobananaStoryboarderDB';
const STORE_NAME = 'AppState';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;
let dbRequest: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbRequest) return dbRequest;

  dbRequest = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains('Assets')) {
        db.createObjectStore('Assets');
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      dbInstance = db;
      
      // Handle connection closing (e.g. from another tab or browser)
      db.onclose = () => {
        dbInstance = null;
        dbRequest = null;
      };
      
      resolve(db);
    };

    request.onerror = () => {
      dbRequest = null;
      reject(request.error);
    };
  });

  return dbRequest;
};

export const saveState = async (key: string, value: any) => {
  try {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    throw e;
  }
};

export const saveAsset = async (blob: Blob): Promise<string> => {
  // Polyfill for crypto.randomUUID in insecure contexts (e.g. HTTP on LAN)
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Simple manual UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const assetId = generateUUID();
  try {
    const db = await getDB();
    return new Promise<string>((resolve, reject) => {
      try {
        const transaction = db.transaction('Assets', 'readwrite');
        const store = transaction.objectStore('Assets');
        store.put(blob, assetId);
        transaction.oncomplete = () => resolve(assetId);
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    throw e;
  }
};

export const deleteAsset = async (assetId: string): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction('Assets', 'readwrite');
        const store = transaction.objectStore('Assets');
        store.delete(assetId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    throw e;
  }
};

export const loadAssetUrl = async (assetId: string): Promise<string | null> => {
  try {
    const db = await getDB();
    return new Promise<string | null>((resolve, reject) => {
      try {
        const transaction = db.transaction('Assets', 'readonly');
        const store = transaction.objectStore('Assets');
        const request = store.get(assetId);
        request.onsuccess = () => {
          const blob = request.result;
          if (blob instanceof Blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    console.error("Failed to load asset URL", e);
    return null;
  }
};

export const loadAssetBase64 = async (assetId: string): Promise<string | null> => {
  try {
    const db = await getDB();
    return new Promise<string | null>((resolve, reject) => {
      try {
        const transaction = db.transaction('Assets', 'readonly');
        const store = transaction.objectStore('Assets');
        const request = store.get(assetId);
        request.onsuccess = () => {
          const blob = request.result;
          if (blob instanceof Blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result);
              } else {
                resolve(null);
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    console.error("Failed to load asset Base64", e);
    return null;
  }
};

export const loadState = async (key: string) => {
  try {
    const db = await getDB();
    return new Promise<any>((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const query = store.get(key);
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    throw e;
  }
};

export const clearState = async (key: string) => {
  try {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    throw e;
  }
};

export interface StorageEstimateInfo {
  usage: number; // bytes
  quota: number; // bytes
  percentage: number; // 0 to 100
}

export const getStorageEstimate = async (): Promise<StorageEstimateInfo> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 1; // avoid divide by zero
    return {
      usage,
      quota,
      percentage: Number(((usage / quota) * 100).toFixed(2))
    };
  }
  return { usage: 0, quota: 1024 * 1024 * 1024 * 2, percentage: 0 };
};

export async function downloadAndSaveVideo(url: string): Promise<{ localUrl: string; assetId: string }> {
  try {
    const proxyUrl = `/api/media/download-proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const blob = await response.blob();
    const assetId = await saveAsset(blob);
    const localUrl = URL.createObjectURL(blob);
    return { localUrl, assetId };
  } catch (e) {
    console.error("Failed to download and save video:", e);
    return { localUrl: url, assetId: '' };
  }
}

export const cleanUnusedLocalBlobs = async (activeIds: Set<string>): Promise<{ cleanedCount: number }> => {
  try {
    const db = await getDB();
    return new Promise<{ cleanedCount: number }>((resolve, reject) => {
      try {
        const transaction = db.transaction('Assets', 'readwrite');
        const store = transaction.objectStore('Assets');
        const request = store.getAllKeys();
        
        request.onsuccess = () => {
          const keys = request.result as string[];
          let cleanedCount = 0;
          for (const key of keys) {
            if (!activeIds.has(key)) {
              store.delete(key);
              cleanedCount++;
            }
          }
          resolve({ cleanedCount });
        };

        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    console.error("Failed to clean unused local blobs:", e);
    return { cleanedCount: 0 };
  }
};
