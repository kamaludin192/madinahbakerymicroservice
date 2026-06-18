import express from 'express';
import cors from 'cors';
import { dbClient } from './db-client.js';

const app = express();
const PORT = process.env.INVENTORY_SERVICE_PORT || 5002;

app.use(cors());
app.use(express.json());

// Product recipes (in kg per single unit)
const RECIPES = {
  'roti-tawar': { tepung: 0.200, mentega: 0.020, ragi: 0.005 },
  'roti-coklat': { tepung: 0.150, mentega: 0.015, ragi: 0.003, coklat: 0.040 },
  'roti-keju': { tepung: 0.150, mentega: 0.015, ragi: 0.003, keju: 0.030 },
  'donat-madu': { tepung: 0.100, mentega: 0.010, ragi: 0.002, madu: 0.015 }
};

// Concurrency lock set to prevent double processing of order events
const processingOrders = new Set();

// Start real-time listener on orders collection (simulating Event Trigger / Firebase onSnapshot)
dbClient.onCollectionChange('orders', async (ordersList) => {
  if (!ordersList || !Array.isArray(ordersList)) return;

  const unprocessedOrders = ordersList.filter(o => o.processed === false && o.status === 'PAID');
  
  for (const order of unprocessedOrders) {
    if (processingOrders.has(order.id)) continue;
    
    // Lock the order ID
    processingOrders.add(order.id);
    
    console.log(`[Inventory Service] ⚙️ Event Trigger: Memproses pemotongan stok untuk order ${order.id}...`);

    try {
      // Fetch current inventory
      const inventory = await dbClient.getDocument('inventory', 'inventory');
      if (!inventory) {
        console.error('[Inventory Service] ❌ Gagal memproses: dokumen inventory tidak ditemukan.');
        processingOrders.delete(order.id);
        continue;
      }

      const updatedProductsStock = { ...inventory.productsStock };
      const updatedIngredients = [...inventory.ingredients];

      // Process recipe deductions
      for (const item of order.items) {
        // 1. Deduct finished product stock (bread)
        if (updatedProductsStock[item.id] !== undefined) {
          updatedProductsStock[item.id] = Math.max(0, updatedProductsStock[item.id] - item.quantity);
          console.log(`[Inventory Service] 📦 Potong stok roti siap jual: ${item.name} (-${item.quantity})`);
        }

        // 2. Deduct raw materials (recipe)
        const recipe = RECIPES[item.id];
        if (recipe) {
          Object.keys(recipe).forEach(ingId => {
            const consumed = recipe[ingId] * item.quantity;
            const ingIdx = updatedIngredients.findIndex(i => i.id === ingId);
            if (ingIdx >= 0) {
              const currentQty = updatedIngredients[ingIdx].quantity;
              const finalQty = Math.max(0, Number((currentQty - consumed).toFixed(3)));
              updatedIngredients[ingIdx].quantity = finalQty;
              console.log(`[Inventory Service] 🌾 Potong bahan baku: ${updatedIngredients[ingIdx].name} (-${consumed.toFixed(3)} kg). Sisa: ${finalQty} kg`);
              
              // Low stock check
              if (finalQty < updatedIngredients[ingIdx].threshold) {
                console.warn(`[Inventory Service] ⚠️ ALERT: Bahan baku "${updatedIngredients[ingIdx].name}" di bawah batas aman (${finalQty} < ${updatedIngredients[ingIdx].threshold} kg)!`);
              }
            }
          });
        }
      }

      // Save updated inventory document
      await dbClient.setDocument('inventory', 'inventory', {
        ingredients: updatedIngredients,
        productsStock: updatedProductsStock
      });

      // Mark order as processed: true
      await dbClient.setDocument('orders', order.id, { processed: true });
      
      console.log(`[Inventory Service] ✅ Order ${order.id} berhasil ditandai selesai dipotong.`);
    } catch (err) {
      console.error(`[Inventory Service] ❌ Gagal memproses stock untuk ${order.id}:`, err);
    } finally {
      processingOrders.delete(order.id);
    }
  }
});

// Endpoint: Membaca Status Stok & Bahan Baku (GET /api/inventory)
app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await dbClient.getDocument('inventory', 'inventory');
    if (!inventory) {
      return res.status(404).json({ error: 'Data inventory belum diinisialisasi.' });
    }
    res.status(200).json(inventory);
  } catch (error) {
    console.error('[Inventory Service] ❌ Gagal mengambil inventory:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
  }
});

// Endpoint: Menambahkan / Restock Barang (POST /api/inventory/restock)
app.post('/api/inventory/restock', async (req, res) => {
  try {
    const { itemType, itemId, quantity } = req.body; // itemType: 'ingredient' | 'product'

    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Input restock tidak valid. Pastikan itemId dan kuantitas diisi.' });
    }

    const inventory = await dbClient.getDocument('inventory', 'inventory');
    if (!inventory) {
      return res.status(404).json({ error: 'Data inventory tidak ditemukan.' });
    }

    const updatedProductsStock = { ...inventory.productsStock };
    const updatedIngredients = [...inventory.ingredients];

    if (itemType === 'ingredient') {
      const ingIdx = updatedIngredients.findIndex(i => i.id === itemId);
      if (ingIdx >= 0) {
        const ing = updatedIngredients[ingIdx];
        const newQty = Number(Math.min(ing.max, ing.quantity + quantity).toFixed(3));
        updatedIngredients[ingIdx].quantity = newQty;
        console.log(`[Inventory Service] 🚚 Restock bahan baku: ${ing.name} (+${quantity} kg). Total: ${newQty} kg`);
      } else {
        return res.status(404).json({ error: `Bahan baku dengan ID ${itemId} tidak ditemukan.` });
      }
    } else if (itemType === 'product') {
      if (updatedProductsStock[itemId] !== undefined) {
        updatedProductsStock[itemId] = updatedProductsStock[itemId] + quantity;
        console.log(`[Inventory Service] 🍞 Restock roti panggang: ${itemId} (+${quantity} pcs). Total: ${updatedProductsStock[itemId]} pcs`);
      } else {
        return res.status(404).json({ error: `Produk dengan ID ${itemId} tidak ditemukan.` });
      }
    } else {
      return res.status(400).json({ error: 'Tipe restock tidak valid. Gunakan "ingredient" atau "product".' });
    }

    // Save update
    await dbClient.setDocument('inventory', 'inventory', {
      ingredients: updatedIngredients,
      productsStock: updatedProductsStock
    });

    res.status(200).json({ status: 'SUCCESS', message: 'Restock berhasil diperbarui.' });
  } catch (error) {
    console.error('[Inventory Service] ❌ Gagal memproses restock:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'Inventory Service', database: dbClient.isFirebase() ? 'Firebase Firestore' : 'Local JSON DB' });
});

app.listen(PORT, () => {
  console.log(`[Inventory Service] 🖥️ Service running on http://localhost:${PORT}`);
  console.log(`[Inventory Service] 🚪 Endpoint GET http://localhost:${PORT}/api/inventory (Loket Cek Stok)`);
  console.log(`[Inventory Service] 🚪 Endpoint POST http://localhost:${PORT}/api/inventory/restock (Loket Restock Gudang)`);
});
