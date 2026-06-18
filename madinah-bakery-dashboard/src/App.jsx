import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  TrendingUp, 
  ShoppingBag, 
  DollarSign, 
  AlertTriangle, 
  Moon, 
  Sun, 
  ShoppingCart, 
  Zap, 
  RefreshCw, 
  Info, 
  Layers, 
  Plus, 
  CheckCircle, 
  Server, 
  Database, 
  Trash2, 
  FileText, 
  Check 
} from 'lucide-react';

const ORDER_API_URL = 'http://localhost:5001/api/orders';
const INVENTORY_API_URL = 'http://localhost:5002/api/inventory';
const RESTOCK_API_URL = 'http://localhost:5002/api/inventory/restock';

// Product Catalog
const PRODUCT_CATALOG = [
  {
    id: 'roti-tawar',
    name: 'Roti Tawar',
    price: 15000,
    category: 'Roti',
    ingredients: { tepung: 0.200, mentega: 0.020, ragi: 0.005 } // in kg
  },
  {
    id: 'roti-coklat',
    name: 'Roti Coklat',
    price: 12000,
    category: 'Roti',
    ingredients: { tepung: 0.150, mentega: 0.015, ragi: 0.003, coklat: 0.040 }
  },
  {
    id: 'roti-keju',
    name: 'Roti Keju',
    price: 14000,
    category: 'Roti',
    ingredients: { tepung: 0.150, mentega: 0.015, ragi: 0.003, keju: 0.030 }
  },
  {
    id: 'donat-madu',
    name: 'Donat Madu',
    price: 8000,
    category: 'Donat',
    ingredients: { tepung: 0.100, mentega: 0.010, ragi: 0.002, madu: 0.015 }
  }
];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Real DB-backed states
  const [orders, setOrders] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [productsStock, setProductsStock] = useState({});
  const [hourlySales, setHourlySales] = useState([0, 0, 0, 0, 0, 0]);
  
  // API loading & error states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [apiError, setApiError] = useState(null);

  // POS Cart State
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('QRIS');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState('');

  // Live Microservices Event Logs Stream
  const [logs, setLogs] = useState([
    { time: '20:30:01', service: 'system', type: 'info', msg: '🚀 Madinah Bakery Microservices Initialized' },
    { time: '20:30:02', service: 'pos', type: 'info', msg: '📡 POS UI Client: Connecting to backend APIs...' },
  ]);

  const logConsoleEndRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logConsoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Sync dark mode class
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Append logs helper
  const addLog = (service, type, msg) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { time: timeStr, service, type, msg }]);
  };

  // Fetch all data from APIs
  const fetchAllData = async (silent = false) => {
    if (!silent) setIsLoadingData(true);
    try {
      // 1. Fetch Orders from Order Service (Port 5001)
      const ordersRes = await fetch(ORDER_API_URL);
      if (!ordersRes.ok) throw new Error('Order Service tidak merespon.');
      const ordersData = await ordersRes.json();
      setOrders(ordersData);

      // 2. Fetch Inventory from Inventory Service (Port 5002)
      const invRes = await fetch(INVENTORY_API_URL);
      if (!invRes.ok) throw new Error('Inventory Service tidak merespon.');
      const invData = await invRes.json();
      setIngredients(invData.ingredients || []);
      setProductsStock(invData.productsStock || {});

      // Calculate hourly sales buckets dynamically based on actual database orders
      calculateHourlyBuckets(ordersData);
      
      setApiError(null);
      if (!silent) {
        addLog('pos', 'success', '📡 Sync Berhasil: Terhubung dengan API Order & Inventory.');
      }
    } catch (err) {
      setApiError(err.message);
      console.error('API Fetch Error:', err);
      if (!silent) {
        addLog('pos', 'error', `❌ Sync Gagal: ${err.message}. Pastikan server backend Anda menyala!`);
      }
    } finally {
      if (!silent) setIsLoadingData(false);
    }
  };

  // Calculate sales bucket totals dynamically
  const calculateHourlyBuckets = (ordersData) => {
    const buckets = [0, 0, 0, 0, 0, 0]; // [08:00, 10:00, 12:00, 14:00, 16:00, 18:00]
    ordersData.forEach(order => {
      const hour = parseInt(order.timestamp.split(':')[0]);
      if (hour >= 8 && hour < 10) buckets[0] += order.total;
      else if (hour >= 10 && hour < 12) buckets[1] += order.total;
      else if (hour >= 12 && hour < 14) buckets[2] += order.total;
      else if (hour >= 14 && hour < 16) buckets[3] += order.total;
      else if (hour >= 16 && hour < 18) buckets[4] += order.total;
      else if (hour >= 18 || hour < 8) buckets[5] += order.total;
    });
    setHourlySales(buckets);
  };

  // Initial Fetch & Poll Data every 3 seconds for real-time dashboard sync
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Add Item to POS Cart
  const addToCart = (product) => {
    const currentStock = productsStock[product.id] || 0;
    const cartItem = cart.find(item => item.id === product.id);
    const cartQty = cartItem ? cartItem.quantity : 0;

    if (currentStock <= cartQty) {
      addLog('pos', 'error', `⚠️ Stok roti siap jual untuk "${product.name}" habis di database!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    addLog('pos', 'info', `🛒 Menambahkan ${product.name} ke keranjang POS.`);
  };

  // Decrease quantity in cart
  const removeFromCart = (productId) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId);
      if (existing.quantity === 1) {
        return prev.filter(item => item.id !== productId);
      }
      return prev.map(item => item.id === productId ? { ...item, quantity: item.quantity - 1 } : item);
    });
    addLog('pos', 'info', `🛒 Mengurangi kuantitas produk.`);
  };

  const clearCart = () => {
    setCart([]);
    addLog('pos', 'info', `🗑️ Keranjang belanja dibersihkan.`);
  };

  // Calculate POS summary
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = Math.round(subtotal * 0.1); // 10% tax
  const totalPay = subtotal + tax;

  // POS Checkout (Triggering actual Backend Rest APIs)
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsProcessingPayment(true);
    addLog('pos', 'info', `📡 Mengirim transaksi senilai Rp ${totalPay.toLocaleString('id-ID')} ke Order Service (Port 5001)...`);

    try {
      // 1. Send Order to Order Service API (Port 5001)
      const response = await fetch(ORDER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          paymentMethod: paymentMethod
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server error.');
      }

      const createdOrder = await response.json();
      setLastCreatedOrderId(createdOrder.id);
      addLog('pos', 'success', `✅ Order Service: Sukses mencatat order ${createdOrder.id} dengan status PAID.`);
      addLog('database', 'success', `🔥 Event Created: Dokumen ${createdOrder.id} ditulis ke database.`);
      
      // Simulate visual payment success
      setIsProcessingPayment(false);
      setPaymentSuccess(true);

      // Trigger background sync log emulation
      addLog('inventory', 'info', `⚙️ Inventory Service (Port 5002) mendeteksi event order. Mulai pemotongan bahan baku di background...`);
      
      // Fetch updated data from API immediately to refresh the UI
      setTimeout(async () => {
        await fetchAllData(true);
        addLog('dashboard', 'success', `🔄 Dashboard Owner: onSnapshot listener terpicu. Tampilan diperbarui secara real-time.`);
      }, 800);

      // Reset cart and checkout states
      setTimeout(() => {
        setCart([]);
        setPaymentSuccess(false);
      }, 4000);

    } catch (err) {
      console.error('Checkout error:', err);
      setIsProcessingPayment(false);
      addLog('pos', 'error', `❌ Gagal memproses transaksi: ${err.message}`);
    }
  };

  // Restock API Trigger (POST to Inventory Service port 5002)
  const handleRestock = async (id, type) => {
    const isIngredient = type === 'ingredient';
    const quantity = isIngredient ? (id === 'ragi' ? 0.5 : 5.0) : 10;
    
    const prodName = isIngredient 
      ? ingredients.find(i => i.id === id)?.name 
      : PRODUCT_CATALOG.find(p => p.id === id)?.name;

    addLog('inventory', 'info', `📡 Mengirim permintaan restock ${prodName} ke Inventory Service (Port 5002)...`);

    try {
      const response = await fetch(RESTOCK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: type,
          itemId: id,
          quantity: quantity
        })
      });

      if (!response.ok) throw new Error('Gagal melakukan restock di server.');

      addLog('inventory', 'success', `🚚 Inventory Service: Restock ${prodName} (+${quantity}) sukses disimpan.`);
      
      // Refresh UI data
      fetchAllData(true);
    } catch (err) {
      addLog('inventory', 'error', `❌ Gagal restock: ${err.message}`);
    }
  };

  // Stats for KPI Cards
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalTransactions = orders.length;
  const topProduct = "Roti Tawar";
  const lowStockCount = ingredients.filter(ing => ing.quantity < ing.threshold).length;

  // ECharts dynamic options
  const getChartOptions = () => {
    const isDark = darkMode;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          return `<div class="p-2 font-sans bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-md">
            <span class="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Jam: ${params[0].name}</span>
            <div class="text-sm font-bold mt-0.5 text-brand-primary dark:text-brand-secondary">
              Rp ${params[0].value.toLocaleString('id-ID')}
            </div>
          </div>`;
        },
        className: 'echarts-custom-tooltip'
      },
      grid: {
        top: '15%',
        left: '2%',
        right: '2%',
        bottom: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00 (Live)'],
        axisLine: {
          lineStyle: { color: isDark ? '#14532d' : '#e2e8f0' }
        },
        axisLabel: {
          color: isDark ? '#a1a1aa' : '#71717a',
          fontSize: 11,
          fontFamily: 'Outfit'
        }
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: isDark ? 'rgba(20, 83, 45, 0.2)' : '#f4f4f5' }
        },
        axisLabel: {
          color: isDark ? '#a1a1aa' : '#71717a',
          fontSize: 11,
          fontFamily: 'Outfit',
          formatter: (value) => `Rp ${value/1000}k`
        }
      },
      series: [
        {
          name: 'Penjualan',
          type: 'bar',
          barWidth: '35%',
          data: hourlySales,
          itemStyle: {
            color: isDark ? '#40b04f' : '#006b3f',
            borderRadius: [6, 6, 0, 0]
          },
          emphasis: {
            itemStyle: {
              color: isDark ? '#4ade80' : '#15803d'
            }
          }
        }
      ]
    };
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightbg text-zinc-900 dark:bg-brand-darkbg dark:text-zinc-50 transition-colors duration-300">
      
      {/* 🚀 HEADER */}
      <header className="border-b border-zinc-200/60 dark:border-emerald-950/80 bg-white/70 dark:bg-emerald-950/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-brand-primary p-2.5 rounded-full flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707M5 12a7 7 0 1114 0 7 7 0 01-14 0z"></path>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-xl text-brand-primary dark:text-brand-secondary font-sans">Madinah</span>
                <span className="font-medium tracking-tight text-xl text-zinc-700 dark:text-zinc-300 font-sans">Bakery</span>
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold tracking-widest uppercase">POS & Inventory Monitor</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            
            {/* Sync status */}
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/60 px-3.5 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/40">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-secondary"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 font-sans">
                {apiError ? 'API Disconnected' : 'Live Firestore Stream'}
              </span>
            </div>

            {/* Dark mode */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl border border-zinc-200 dark:border-emerald-800/20 bg-white dark:bg-emerald-950/20 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-emerald-900/20 transition-all shadow-sm"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

          </div>
        </div>
      </header>

      {/* ⚠️ API OFFLINE WARNING */}
      {apiError && (
        <div className="max-w-[1600px] mx-auto px-6 pt-6 w-full">
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/30 text-rose-800 dark:text-rose-300 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <p className="text-xs font-bold font-sans">API Server Offline!</p>
              <p className="text-[10px] opacity-80 mt-0.5">Tidak dapat terhubung ke server backend di port 5001 & 5002. Pastikan kedua microservices backend telah menyala.</p>
            </div>
            <button 
              onClick={() => fetchAllData()} 
              className="ml-auto bg-rose-500 hover:bg-rose-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3 animate-spin" /> Hubungkan
            </button>
          </div>
        </div>
      )}

      {/* 📦 MAIN CONTENT GRID */}
      <main className="max-w-[1600px] mx-auto p-6 w-full grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
        
        {/* LEFT SECTION (DASHBOARD TABS) */}
        <section className="lg:col-span-2 flex flex-col gap-6">

          <div className="bg-zinc-100 dark:bg-emerald-950/20 p-1.5 rounded-xl flex w-fit border border-zinc-200/40 dark:border-emerald-900/10">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all ${
                activeTab === 'overview' 
                  ? 'bg-white dark:bg-brand-primary text-brand-primary dark:text-white shadow-sm' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <TrendingUp className="w-4.5 h-4.5" />
              <span>Dashboard Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all ${
                activeTab === 'architecture' 
                  ? 'bg-white dark:bg-brand-primary text-brand-primary dark:text-white shadow-sm' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Layers className="w-4.5 h-4.5" />
              <span>Arsitektur & Event Flow</span>
            </button>
          </div>

          {activeTab === 'overview' && (
            <>
              {/* KPI STATS ROW */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* METRIC 1 */}
                <div className="glass-card p-5 flex flex-col justify-between hover:scale-[1.01] transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">Pendapatan Hari Ini</span>
                    <span className="bg-brand-secondary/10 dark:bg-emerald-900/30 text-brand-secondary text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                      <TrendingUp className="w-2.5 h-2.5" /> +12%
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
                      Rp {totalRevenue.toLocaleString('id-ID')}
                    </h3>
                    <p className="text-[10px] text-zinc-400 mt-1">Menggunakan data REST API Asli</p>
                  </div>
                </div>

                {/* METRIC 2 */}
                <div className="glass-card p-5 flex flex-col justify-between hover:scale-[1.01] transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">Total Transaksi</span>
                    <span className="bg-emerald-50 dark:bg-emerald-950/40 text-brand-primary dark:text-brand-secondary text-xs p-1 rounded-lg">
                      <ShoppingBag className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
                      {totalTransactions} <span className="text-sm font-medium text-zinc-400">Order</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400 mt-1">Rata-rata: Rp {(totalRevenue / (totalTransactions || 1)).toLocaleString('id-ID', {maximumFractionDigits: 0})} / trx</p>
                  </div>
                </div>

                {/* METRIC 3 */}
                <div className="glass-card p-5 flex flex-col justify-between hover:scale-[1.01] transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">Produk Terlaris</span>
                    <span className="bg-amber-100 dark:bg-amber-900/30 text-brand-accent text-[10px] px-2 py-0.5 rounded-full font-bold">
                      Bestseller
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight truncate">
                      {topProduct}
                    </h3>
                    <p className="text-[10px] text-zinc-400 mt-1">Porsi tertinggi penjualan harian</p>
                  </div>
                </div>

                {/* METRIC 4 */}
                <div className={`glass-card p-5 flex flex-col justify-between border-l-4 transition-all duration-300 hover:scale-[1.01] ${
                  lowStockCount > 0 
                    ? 'border-l-brand-accent dark:border-l-brand-accent bg-amber-500/5' 
                    : 'border-l-brand-secondary'
                }`}>
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">Alert Bahan Baku</span>
                    <span className={`p-1 rounded-lg text-xs ${
                      lowStockCount > 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-brand-accent' : 'bg-green-100 dark:bg-green-950 text-brand-secondary'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
                      {lowStockCount} <span className="text-sm font-medium text-zinc-400">Kritis</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400 mt-1 font-sans">
                      {lowStockCount > 0 ? 'Segera lakukan restock!' : 'Semua bahan baku aman.'}
                    </p>
                  </div>
                </div>

              </div>

              {/* SALES CHART CONTAINER */}
              <div className="glass-card p-6 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Grafik Tren Omset Penjualan Harian</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Penjualan per 2 jam hari ini (terupdate real-time via POS)</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-primary dark:bg-brand-secondary"></span>
                    <span>Omset Penjualan</span>
                  </div>
                </div>
                <div className="h-64 w-full">
                  {isLoadingData ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-brand-primary dark:text-brand-secondary" />
                      <span className="text-xs text-zinc-400 animate-pulse">Menghubungkan ke API...</span>
                    </div>
                  ) : (
                    <ReactECharts 
                      option={getChartOptions()} 
                      style={{ height: '100%', width: '100%' }}
                      theme={darkMode ? 'dark' : 'light'}
                    />
                  )}
                </div>
              </div>

              {/* STOCK MONITOR TABLES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. RAW INGREDIENT INVENTORY */}
                <div className="glass-card p-5 flex flex-col">
                  <div className="flex justify-between items-center border-b border-zinc-200/50 dark:border-emerald-800/10 pb-3 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Inventory Bahan Baku</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Dikelola dalam satuan metrik (kg)</p>
                    </div>
                    <span className="text-xs bg-zinc-100 dark:bg-emerald-950/40 text-zinc-600 dark:text-zinc-300 font-mono px-2 py-0.5 rounded">
                      {ingredients.length} Item
                    </span>
                  </div>
                  
                  {isLoadingData ? (
                    <div className="h-32 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
                      <span className="text-[10px] text-zinc-400">Loading data...</span>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                      {ingredients.map(ing => {
                        const isLow = ing.quantity < ing.threshold;
                        const percentage = Math.min(100, Math.round((ing.quantity / ing.max) * 100));
                        
                        return (
                          <div key={ing.id} className="flex flex-col gap-1.5 border-b border-zinc-100 dark:border-emerald-950/20 pb-3 last:border-0 last:pb-0">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-sans">{ing.name}</span>
                                {isLow && (
                                  <span className="bg-amber-500/15 text-brand-accent text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded animate-pulse">
                                    LOW_STOCK
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">
                                  {ing.quantity.toFixed(2)} / {ing.max} {ing.unit}
                                </span>
                                <button
                                  onClick={() => handleRestock(ing.id, 'ingredient')}
                                  className="p-1 rounded-md bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="w-full h-2 bg-zinc-200 dark:bg-emerald-950/80 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isLow ? 'bg-brand-accent animate-pulse' : 'bg-brand-primary dark:bg-brand-secondary'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. FINISHED PRODUCT STOCKS */}
                <div className="glass-card p-5 flex flex-col">
                  <div className="flex justify-between items-center border-b border-zinc-200/50 dark:border-emerald-800/10 pb-3 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Stok Roti Siap Jual</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Stok di rak etalase toko (pcs)</p>
                    </div>
                    <span className="text-xs bg-zinc-100 dark:bg-emerald-950/40 text-zinc-600 dark:text-zinc-300 font-mono px-2 py-0.5 rounded">
                      4 Item
                    </span>
                  </div>

                  {isLoadingData ? (
                    <div className="h-32 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
                      <span className="text-[10px] text-zinc-400">Loading data...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                      {PRODUCT_CATALOG.map(prod => {
                        const stock = productsStock[prod.id] || 0;
                        const isLow = stock < 5;
                        
                        return (
                          <div key={prod.id} className="flex justify-between items-center p-2.5 rounded-lg bg-zinc-50 dark:bg-emerald-950/10 hover:bg-zinc-100/50 dark:hover:bg-emerald-900/10 border border-zinc-200/20 dark:border-emerald-800/5 transition-all">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-sans">{prod.name}</span>
                              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Rp {prod.price.toLocaleString('id-ID')}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-3.5">
                              <div className="text-right">
                                <span className={`text-sm font-bold font-mono ${isLow ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                  {stock} <span className="text-xs font-normal text-zinc-400">pcs</span>
                                </span>
                                {isLow && (
                                  <p className="text-[8px] text-red-400 font-bold uppercase tracking-wide mt-0.5">LOW</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleRestock(prod.id, 'product')}
                                className="p-1.5 rounded-md bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </>
          )}

          {/* TAB CONTENT: 2. ARCHITECTURE DIAGRAM */}
          {activeTab === 'architecture' && (
            <div className="glass-card p-6 flex flex-col gap-6">
              
              <div className="border-b border-zinc-200/50 dark:border-emerald-800/10 pb-4">
                <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans flex items-center gap-2">
                  <Layers className="text-brand-secondary w-5 h-5" />
                  <span>Arsitektur Microservices POS & Inventory Madinah Bakery</span>
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Bagaimana data mengalir secara asinkron dan real-time menggunakan Firebase Firestore</p>
              </div>

              {/* Interactive SVG Diagram */}
              <div className="bg-zinc-50 dark:bg-emerald-950/30 p-6 rounded-xl border border-zinc-200/30 dark:border-emerald-800/10 flex justify-center items-center">
                <svg viewBox="0 0 800 380" className="w-full max-w-[700px] h-auto text-zinc-800 dark:text-zinc-200">
                  <defs>
                    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#006b3f" />
                      <stop offset="100%" stopColor="#004a2c" />
                    </linearGradient>
                    <linearGradient id="secondaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#40b04f" />
                      <stop offset="100%" stopColor="#2e8c3a" />
                    </linearGradient>
                  </defs>

                  {/* Node 1: POS UI */}
                  <rect x="30" y="40" width="160" height="70" rx="10" fill="url(#primaryGrad)" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))" />
                  <text x="110" y="70" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">1. POS Cashier Client</text>
                  <text x="110" y="90" fill="#a7f3d0" fontSize="10" fontStyle="italic" textAnchor="middle">React / Next.js POS</text>

                  {/* Database: Firestore orders */}
                  <path d="M110,180 C110,165 230,165 230,180 C230,195 110,195 110,180" stroke="#006b3f" strokeWidth="2" fill="none" />
                  <rect x="70" y="195" width="80" height="50" rx="4" fill="#14532d" />
                  <text x="110" y="215" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">Firestore</text>
                  <text x="110" y="230" fill="#a1a1aa" fontSize="9" textAnchor="middle">/orders</text>

                  {/* Flow Arrow 1 to DB */}
                  <path d="M110,110 L110,190" stroke="#006b3f" strokeWidth="2" fill="none" strokeDasharray="4" />
                  <text x="120" y="150" fill="#71717a" fontSize="9">POS menulis order</text>

                  {/* Node 2: Cloud Function / Event Trigger */}
                  <rect x="320" y="185" width="160" height="70" rx="10" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                  <text x="400" y="215" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">2. Cloud Function</text>
                  <text x="400" y="235" fill="#38bdf8" fontSize="10" fontStyle="italic" textAnchor="middle">Inventory Listener</text>

                  {/* Flow Arrow DB to Worker */}
                  <path d="M150,220 L310,220" stroke="#40b04f" strokeWidth="2" fill="none" />
                  <circle cx="230" cy="220" r="15" fill="#40b04f" />
                  <text x="230" y="224" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">ON</text>
                  <text x="230" y="248" fill="#71717a" fontSize="8" textAnchor="middle">Trigger Event</text>

                  {/* Database: Firestore Inventory */}
                  <rect x="610" y="195" width="80" height="50" rx="4" fill="#14532d" />
                  <text x="650" y="215" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">Firestore</text>
                  <text x="650" y="230" fill="#a1a1aa" fontSize="9" textAnchor="middle">/inventory</text>

                  {/* Flow Arrow Worker to DB */}
                  <path d="M480,220 L600,220" stroke="#40b04f" strokeWidth="2" fill="none" />
                  <text x="540" y="210" fill="#71717a" fontSize="8" textAnchor="middle">Kurangi stok</text>

                  {/* Node 3: Owner Dashboard */}
                  <rect x="320" y="40" width="160" height="70" rx="10" fill="url(#secondaryGrad)" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))" />
                  <text x="400" y="70" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">3. Owner Dashboard</text>
                  <text x="400" y="90" fill="#d1fae5" fontSize="10" fontStyle="italic" textAnchor="middle">Grafik & Alert Stok</text>

                  {/* Sync lines */}
                  <path d="M150,195 L320,80" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3" fill="none" />
                  <text x="210" y="125" fill="#d97706" fontSize="8" transform="rotate(-30 210 125)">onSnapshot() Pendapatan</text>

                  <path d="M610,195 L480,80" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3" fill="none" />
                  <text x="560" y="125" fill="#d97706" fontSize="8" transform="rotate(38 560 125)">onSnapshot() Alert Stok</text>
                </svg>
              </div>

              {/* Decoupled Flow Walkthrough */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-emerald-950/10 border border-zinc-200/40 dark:border-emerald-800/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-brand-primary text-white text-xs font-extrabold flex items-center justify-center">1</span>
                    <h5 className="text-xs font-bold font-sans text-zinc-900 dark:text-white">POS Input & Payment</h5>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Kasir memasukkan roti ke keranjang belanja POS. Setelah pembayaran selesai (Cash/QRIS), POS menulis data pesanan dengan status <code className="text-brand-secondary dark:text-green-400 font-mono text-[10px] bg-green-500/10 px-1 rounded">PAID</code> ke koleksi <code className="font-mono text-[10px]">/orders</code> di Firestore.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-emerald-950/10 border border-zinc-200/40 dark:border-emerald-800/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 dark:bg-zinc-700 text-white text-xs font-extrabold flex items-center justify-center">2</span>
                    <h5 className="text-xs font-bold font-sans text-zinc-900 dark:text-white">Inventory Event Trigger</h5>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Mekanisme trigger Firestore mendeteksi entri baru. **Inventory Service** memproses resep roti yang dibeli (misal: Tepung & Mentega), lalu memotong kuantitas bahan baku di koleksi <code className="font-mono text-[10px]">/inventory</code> secara asinkron.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-emerald-950/10 border border-zinc-200/40 dark:border-emerald-800/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-brand-secondary text-white text-xs font-extrabold flex items-center justify-center">3</span>
                    <h5 className="text-xs font-bold font-sans text-zinc-900 dark:text-white">Live Owner Update</h5>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Aplikasi **Owner Dashboard** menggunakan listener real-time <code className="font-mono text-[10px] text-amber-500">onSnapshot()</code>. Setiap perubahan data di Firestore akan memicu UI update secara langsung tanpa re-load halaman.
                  </p>
                </div>
              </div>

            </div>
          )}

        </section>

        {/* RIGHT SECTION (POS SIMULATOR) */}
        <section className="flex flex-col gap-6">

          {/* POS CASHIER TERMINAL CARD */}
          <div className="glass-card p-5 border-t-4 border-t-brand-primary dark:border-t-brand-secondary flex flex-col gap-4">
            
            <div className="flex justify-between items-center border-b border-zinc-200/50 dark:border-emerald-800/10 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4.5 h-4.5 text-brand-primary dark:text-brand-secondary" />
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">POS Cashier Terminal</h4>
              </div>
              <span className="text-[9px] bg-brand-primary/10 text-brand-primary dark:text-brand-secondary font-bold uppercase px-2 py-0.5 rounded tracking-wide">
                Simulator
              </span>
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_CATALOG.map(prod => (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="flex flex-col text-left p-2.5 rounded-xl bg-zinc-50 dark:bg-emerald-950/20 border border-zinc-200/30 dark:border-emerald-800/15 hover:border-brand-primary dark:hover:border-brand-secondary hover:bg-zinc-100/50 dark:hover:bg-emerald-900/10 transition-all group shadow-sm active:scale-95"
                >
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-sans group-hover:text-brand-primary dark:group-hover:text-brand-secondary">{prod.name}</span>
                  <div className="flex justify-between items-center w-full mt-2">
                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 font-bold">
                      Rp {prod.price.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[9px] bg-zinc-200 dark:bg-emerald-950 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                      Sisa: {productsStock[prod.id] || 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Cart Items List */}
            <div className="bg-zinc-50 dark:bg-emerald-950/35 rounded-xl border border-zinc-200/30 dark:border-emerald-980/10 p-3 min-h-[140px] max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col justify-between">
              
              {cart.length === 0 ? (
                <div className="my-auto flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-1.5 p-4">
                  <ShoppingCart className="w-8 h-8 opacity-40" />
                  <span className="text-[11px] font-medium tracking-wide">Keranjang belanja kosong</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-xs border-b border-zinc-200/10 pb-2 last:border-0 last:pb-0">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 font-sans">{item.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">Rp {item.price.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-5 h-5 rounded bg-zinc-200 dark:bg-emerald-900/40 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold font-mono hover:bg-zinc-300 dark:hover:bg-emerald-800 transition-colors"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-100">{item.quantity}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-5 h-5 rounded bg-zinc-200 dark:bg-emerald-900/40 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold font-mono hover:bg-zinc-300 dark:hover:bg-emerald-800 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="flex justify-end pt-2 mt-2 border-t border-zinc-200/10">
                  <button 
                    onClick={clearCart} 
                    className="text-[10px] text-red-500 dark:text-red-400 flex items-center gap-1 hover:underline font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Bersihkan
                  </button>
                </div>
              )}
            </div>

            {/* Calculations & Checkout */}
            {cart.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-zinc-200/40 dark:border-emerald-800/10 pt-3">
                
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>Subtotal</span>
                    <span className="font-mono">Rp {subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>Pajak Restoran (PB1 10%)</span>
                    <span className="font-mono">Rp {tax.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-zinc-900 dark:text-white border-t border-zinc-200/10 pt-1.5">
                    <span>Total Pembayaran</span>
                    <span className="font-mono text-brand-primary dark:text-brand-secondary">
                      Rp {totalPay.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Metode Pembayaran</span>
                  <div className="grid grid-cols-2 gap-2 bg-zinc-100 dark:bg-emerald-950/60 p-1 rounded-xl">
                    <button
                      onClick={() => setPaymentMethod('QRIS')}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        paymentMethod === 'QRIS'
                          ? 'bg-white dark:bg-brand-primary text-brand-primary dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      QRIS / E-Wallet
                    </button>
                    <button
                      onClick={() => setPaymentMethod('Cash')}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        paymentMethod === 'Cash'
                          ? 'bg-white dark:bg-brand-primary text-brand-primary dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      Tunai (Cash)
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={isProcessingPayment || paymentSuccess}
                  className={`w-full py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all flex items-center justify-center gap-2 ${
                    paymentSuccess 
                      ? 'bg-brand-secondary cursor-default' 
                      : 'bg-brand-primary hover:bg-[#005230] hover:shadow-lg active:scale-98 disabled:opacity-50'
                  }`}
                >
                  {isProcessingPayment ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memproses Pembayaran...</span>
                    </>
                  ) : paymentSuccess ? (
                    <>
                      <Check className="w-4.5 h-4.5" />
                      <span>Pembayaran Sukses!</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4.5 h-4.5" />
                      <span>Proses Pembayaran</span>
                    </>
                  )}
                </button>

              </div>
            )}
            
          </div>

          {/* MICROSERVICES EVENT CONSOLE */}
          <div className="glass-card p-4 bg-zinc-950 dark:bg-black/85 border border-zinc-800 flex flex-col gap-3 font-mono">
            
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                <span>Microservice Log Console</span>
              </div>
              <button 
                onClick={() => setLogs([])}
                className="text-[9px] text-zinc-500 hover:text-zinc-300 underline"
              >
                Clear
              </button>
            </div>

            <div className="h-56 overflow-y-auto pr-1 custom-scrollbar text-[10px] space-y-2 flex flex-col">
              {logs.length === 0 ? (
                <div className="my-auto text-center text-zinc-600 italic">No system events logged</div>
              ) : (
                logs.map((log, index) => {
                  let colorClass = 'text-zinc-300';
                  if (log.type === 'success') colorClass = 'text-green-400';
                  if (log.type === 'warn') colorClass = 'text-brand-accent';
                  if (log.type === 'error') colorClass = 'text-red-400 font-bold';

                  let serviceTagColor = 'bg-zinc-800 text-zinc-400';
                  if (log.service === 'pos') serviceTagColor = 'bg-blue-900/30 text-blue-400';
                  if (log.service === 'inventory') serviceTagColor = 'bg-purple-900/30 text-purple-400';
                  if (log.service === 'database') serviceTagColor = 'bg-emerald-900/30 text-brand-secondary';
                  if (log.service === 'dashboard') serviceTagColor = 'bg-amber-900/30 text-brand-accent';

                  return (
                    <div key={index} className="flex flex-col gap-1 leading-normal border-b border-zinc-900/40 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-600 font-medium font-mono">[{log.time}]</span>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded font-mono ${serviceTagColor}`}>
                          {log.service}
                        </span>
                      </div>
                      <span className={`font-mono leading-relaxed pl-1 ${colorClass}`}>{log.msg}</span>
                    </div>
                  );
                })
              )}
              <div ref={logConsoleEndRef} />
            </div>

          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-200/40 dark:border-emerald-950/80 mt-auto py-5 bg-white/40 dark:bg-emerald-950/5">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-zinc-400 font-sans">
          <p>© 2026 Madinah Bakery. Powered by Next.js & Firebase microservices architecture.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-brand-primary dark:hover:text-brand-secondary transition-colors font-semibold">PRD Specs</a>
            <span>•</span>
            <a href="#" className="hover:text-brand-primary dark:hover:text-brand-secondary transition-colors font-semibold">Microservices Api Docs</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
