import express from 'express';
import cors from 'cors';
import { dbClient } from './db-client.js';

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT || 5001;

app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[Order Service] 🛒 ${req.method} ${req.url}`);
  next();
});

// Endpoint: Menerima Pesanan Baru (POST /api/orders)
app.post('/api/orders', async (req, res) => {
  try {
    const { items, paymentMethod } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja kosong atau format tidak valid.' });
    }

    // Calculate subtotal, tax and total
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.round(subtotal * 0.1); // 10% PB1 Restaurant Tax
    const total = subtotal + tax;
    
    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"

    const newOrder = {
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      timestamp,
      subtotal,
      tax,
      total,
      paymentMethod: paymentMethod || 'QRIS',
      status: 'PAID',
      processed: false, // will be picked up by Inventory Service event listener
      createdAt: now.toISOString()
    };

    // Save to database (orders collection)
    await dbClient.setDocument('orders', orderId, newOrder);
    
    console.log(`[Order Service] ✅ Order ${orderId} sukses tersimpan ke Database. Total: Rp ${total.toLocaleString('id-ID')}`);
    
    res.status(201).json({ id: orderId, ...newOrder });
  } catch (error) {
    console.error('[Order Service] ❌ Gagal membuat order:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
  }
});

// Endpoint: Mengambil Semua Daftar Pesanan (GET /api/orders)
app.get('/api/orders', async (req, res) => {
  try {
    const allOrders = await dbClient.getCollection('orders');
    
    // If Firebase, it returns array. If local DB, it returns array.
    // Sort by createdAt descending
    const sortedOrders = Array.isArray(allOrders) 
      ? allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      : [];
      
    res.status(200).json(sortedOrders);
  } catch (error) {
    console.error('[Order Service] ❌ Gagal mengambil orders:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'Order Service', database: dbClient.isFirebase() ? 'Firebase Firestore' : 'Local JSON DB' });
});

app.listen(PORT, () => {
  console.log(`[Order Service] 🖥️ Service running on http://localhost:${PORT}`);
  console.log(`[Order Service] 🚪 Endpoint POST http://localhost:${PORT}/api/orders (Loket Transaksi POS)`);
  console.log(`[Order Service] 🚪 Endpoint GET http://localhost:${PORT}/api/orders (Daftar Transaksi Owner)`);
});
