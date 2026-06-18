import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let useFirebase = false;
let db = null;

// Try to initialize Firebase Admin SDK
const firebaseCredPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(firebaseCredPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(firebaseCredPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    useFirebase = true;
    console.log('🔥 Firebase Admin SDK: Firestore Initialized');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase, falling back to Local JSON DB:', err.message);
  }
} else {
  console.log('📁 No serviceAccountKey.json found, running in Local JSON DB Mode');
}

// Local Database Helpers
const getLocalPath = (col) => path.join(DATA_DIR, `${col}.json`);

const readLocal = (col) => {
  const filePath = getLocalPath(col);
  if (!fs.existsSync(filePath)) {
    // Seed default data if file is missing
    if (col === 'inventory') {
      const defaultInventory = {
        ingredients: [
          { id: 'tepung', name: 'Tepung Terigu', quantity: 8.5, max: 15.0, threshold: 5.0, unit: 'kg' },
          { id: 'mentega', name: 'Mentega / Butter', quantity: 2.1, max: 5.0, threshold: 2.0, unit: 'kg' },
          { id: 'ragi', name: 'Ragi Instan', quantity: 0.52, max: 1.5, threshold: 0.5, unit: 'kg' },
          { id: 'coklat', name: 'Coklat Batang', quantity: 3.0, max: 6.0, threshold: 1.5, unit: 'kg' },
          { id: 'keju', name: 'Keju Cheddar', quantity: 2.5, max: 5.0, threshold: 1.0, unit: 'kg' },
          { id: 'madu', name: 'Madu Alami', quantity: 1.2, max: 3.0, threshold: 0.6, unit: 'kg' }
        ],
        productsStock: {
          'roti-tawar': 15,
          'roti-coklat': 25,
          'roti-keju': 18,
          'donat-madu': 30
        }
      };
      writeLocal(col, defaultInventory);
      return defaultInventory;
    }
    if (col === 'orders') {
      const defaultOrders = [];
      writeLocal(col, defaultOrders);
      return defaultOrders;
    }
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeLocal = (col, data) => {
  fs.writeFileSync(getLocalPath(col), JSON.stringify(data, null, 2), 'utf8');
};

export const dbClient = {
  isFirebase: () => useFirebase,

  getCollection: async (col) => {
    if (useFirebase) {
      const snapshot = await db.collection(col).get();
      const docs = [];
      snapshot.forEach(doc => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      return docs;
    } else {
      return readLocal(col);
    }
  },

  setDocument: async (col, docId, data) => {
    if (useFirebase) {
      await db.collection(col).doc(docId).set(data, { merge: true });
    } else {
      if (col === 'orders') {
        const orders = readLocal(col);
        const existingIdx = orders.findIndex(o => o.id === docId);
        if (existingIdx >= 0) {
          orders[existingIdx] = { ...orders[existingIdx], ...data };
        } else {
          orders.push({ id: docId, ...data });
        }
        writeLocal(col, orders);
      } else {
        const dbData = readLocal(col);
        dbData[docId] = { ...dbData[docId], ...data };
        writeLocal(col, dbData);
      }
    }
  },

  getDocument: async (col, docId) => {
    if (useFirebase) {
      const doc = await db.collection(col).doc(docId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } else {
      if (col === 'orders') {
        const orders = readLocal(col);
        return orders.find(o => o.id === docId) || null;
      } else {
        const dbData = readLocal(col);
        return dbData[docId] || null;
      }
    }
  },

  // Listen to changes (Real-time snapshot triggers)
  onCollectionChange: (col, callback) => {
    if (useFirebase) {
      return db.collection(col).onSnapshot(snapshot => {
        const docs = [];
        snapshot.forEach(doc => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        callback(docs);
      });
    } else {
      const filePath = getLocalPath(col);
      // Ensure file is seeded
      readLocal(col);

      // File Watcher to notify other microservice processes of DB changes
      let watchTimeout;
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          // Debounce reads slightly to prevent double-read during write locks
          clearTimeout(watchTimeout);
          watchTimeout = setTimeout(() => {
            try {
              const data = readLocal(col);
              callback(data);
            } catch (e) {
              // Ignore temporary read lock errors
            }
          }, 50);
        }
      });

      // Initial read
      callback(readLocal(col));

      // Return unsubscribe closure
      return () => {
        clearTimeout(watchTimeout);
        watcher.close();
      };
    }
  }
};
