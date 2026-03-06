import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  AlertTriangle, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search,
  Filter,
  MoreVertical,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Box,
  ShoppingCart,
  Store,
  CreditCard,
  ShoppingBag,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  MessageSquare,
  X,
  Send,
  Bot,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import Markdown from 'react-markdown';

// Types
interface Product {
  id: number;
  name: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  min_stock: number;
  category_id: number;
  category_name: string;
  image_url?: string;
  updated_at: string;
}

interface Movement {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  created_at: string;
}

interface Stats {
  totalProducts: number;
  lowStock: number;
  totalValue: number;
  recentMovements: Movement[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'shop'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'bot', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [productsRes, statsRes, movementsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/stats'),
        fetch('/api/movements')
      ]);
      
      setProducts(await productsRes.json());
      setStats(await statsRes.json());
      setMovements(await movementsRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      product_id: selectedProduct?.id,
      type: formData.get('type'),
      quantity: parseInt(formData.get('quantity') as string),
      reason: formData.get('reason')
    };

    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      setIsAdjustModalOpen(false);
      fetchData();
    }
  };

  const generateAIImage = async (name: string, description: string) => {
    setIsGeneratingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `A high-quality, professional product photo of ${name}. ${description}. Studio lighting, clean background, commercial photography style.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64EncodeString}`;
          setGeneratedImageUrl(imageUrl);
          return imageUrl;
        }
      }
    } catch (error) {
      console.error('Error generating AI image:', error);
      alert('Error al generar la imagen con IA. Inténtalo de nuevo.');
    } finally {
      setIsGeneratingImage(false);
    }
    return null;
  };

  const updateProductImage = async (productId: number, imageUrl: string) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl })
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error updating product image:', error);
    }
  };

  const handleGenerateForExisting = async (product: Product) => {
    const imageUrl = await generateAIImage(product.name, product.description);
    if (imageUrl) {
      await updateProductImage(product.id, imageUrl);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Provide context about the current inventory
      const inventoryContext = products.map(p => 
        `- ${p.name} (SKU: ${p.sku}): $${p.price}, Stock: ${p.stock}, Categoría: ${p.category_name}`
      ).join('\n');

      const systemInstruction = `Eres un asistente inteligente de gestión de inventario para "StockMaster Pro". 
      Tu objetivo es ayudar al usuario con dudas sobre el inventario, ventas y productos.
      
      DATOS ACTUALES DEL INVENTARIO:
      ${inventoryContext}
      
      Responde de forma concisa, profesional y amable en español. Puedes usar markdown para dar formato.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...chatMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction,
        }
      });

      const botResponse = response.text || "Lo siento, no pude procesar tu solicitud.";
      setChatMessages(prev => [...prev, { role: 'bot', content: botResponse }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, { role: 'bot', content: "Hubo un error al conectar con mi cerebro artificial. Por favor, inténtalo de nuevo." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    if (generatedImageUrl) {
      data.image_url = generatedImageUrl;
    }

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      setIsAddModalOpen(false);
      setGeneratedImageUrl(null);
      fetchData();
    }
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert("No hay más stock disponible");
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    try {
      for (const item of cart) {
        await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: item.product.id,
            type: 'OUT',
            quantity: item.quantity,
            reason: 'Venta Online (Carrito)'
          })
        });
      }
      
      setCart([]);
      setIsCartOpen(false);
      fetchData();
      alert('¡Pedido procesado con éxito!');
    } catch (error) {
      console.error('Error in checkout:', error);
      alert('Hubo un error al procesar el pedido');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-bottom border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <Box size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">StockMaster</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Package size={20} />
            Inventario
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <History size={20} />
            Movimientos
          </button>
          <div className="pt-4 pb-2 px-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Canales</span>
          </div>
          <button 
            onClick={() => setActiveTab('shop')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'shop' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Store size={20} />
            Tienda Online
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <AlertTriangle size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Alertas</span>
            </div>
            <p className="text-sm text-slate-600">
              {stats?.lowStock || 0} productos con stock bajo.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-8">
            {activeTab === 'shop' && (
              <div className="flex items-center gap-2 text-emerald-600">
                <Store size={24} />
                <span className="font-bold text-lg">Tienda StockMaster</span>
              </div>
            )}
            <div className={`flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 ${activeTab === 'shop' ? 'w-80' : 'w-96'}`}>
              <Search size={18} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar productos..." 
                className="bg-transparent border-none outline-none text-sm w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeTab !== 'shop' ? (
              <>
                <button 
                  onClick={() => setActiveTab('shop')}
                  className="text-emerald-600 border border-emerald-200 px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-50 transition-all"
                >
                  <ShoppingCart size={20} />
                  Ver Tienda
                </button>
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  <Plus size={20} />
                  Nuevo Producto
                </button>
              </>
            ) : (
              <div className="flex items-center gap-6">
                <div 
                  onClick={() => setIsCartOpen(true)}
                  className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 cursor-pointer transition-colors relative"
                >
                  <ShoppingCart size={22} />
                  <span className="text-sm font-semibold">Carrito</span>
                  {cart.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {cart.reduce((sum, i) => sum + i.quantity, 0)}
                    </span>
                  )}
                </div>
                <div className="h-8 w-[1px] bg-slate-200"></div>
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="text-indigo-600 border border-indigo-200 px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-50 transition-all"
                >
                  <LayoutDashboard size={20} />
                  Panel Admin
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <Package size={24} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total</span>
                    </div>
                    <h3 className="text-3xl font-bold">{stats?.totalProducts || 0}</h3>
                    <p className="text-slate-500 text-sm mt-1">Productos en catálogo</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                        <AlertTriangle size={24} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Alerta</span>
                    </div>
                    <h3 className="text-3xl font-bold text-amber-600">{stats?.lowStock || 0}</h3>
                    <p className="text-slate-500 text-sm mt-1">Stock bajo o agotado</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <DollarSign size={24} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor</span>
                    </div>
                    <h3 className="text-3xl font-bold">${stats?.totalValue.toLocaleString() || 0}</h3>
                    <p className="text-slate-500 text-sm mt-1">Valor total del inventario</p>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="font-bold text-lg">Movimientos Recientes</h2>
                      <button onClick={() => setActiveTab('history')} className="text-indigo-600 text-sm font-semibold hover:underline">Ver todos</button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {stats?.recentMovements.map((m) => (
                        <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${m.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {m.type === 'IN' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{m.product_name}</p>
                              <p className="text-xs text-slate-500">{m.reason || 'Sin motivo'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${m.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {m.type === 'IN' ? '+' : '-'}{m.quantity}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{new Date(m.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="font-bold text-lg mb-6">Estado del Inventario</h2>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="text-sm text-slate-600">Stock Saludable</span>
                        </div>
                        <span className="font-bold">{products.filter(p => p.stock > p.min_stock).length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <span className="text-sm text-slate-600">Stock Bajo</span>
                        </div>
                        <span className="font-bold">{products.filter(p => p.stock <= p.min_stock && p.stock > 0).length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <span className="text-sm text-slate-600">Agotado</span>
                        </div>
                        <span className="font-bold">{products.filter(p => p.stock === 0).length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'inventory' && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">SKU</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Categoría</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Precio</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Stock</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((product) => (
                        <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Box size={20} className="text-slate-300" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{product.name}</p>
                                <p className="text-xs text-slate-400 truncate max-w-[200px]">{product.description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-500">{product.sku}</td>
                          <td className="px-6 py-4">
                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-[10px] font-bold uppercase">
                              {product.category_name || 'General'}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-semibold text-sm">${product.price.toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm ${product.stock <= product.min_stock ? 'text-rose-600' : 'text-slate-900'}`}>
                                {product.stock}
                              </span>
                              {product.stock <= product.min_stock && (
                                <AlertTriangle size={14} className="text-amber-500" />
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setIsAdjustModalOpen(true);
                                }}
                                className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm"
                              >
                                Ajustar
                              </button>
                              {!product.image_url && (
                                <button 
                                  onClick={() => handleGenerateForExisting(product)}
                                  disabled={isGeneratingImage}
                                  className="text-emerald-600 hover:text-emerald-800 font-semibold text-sm flex items-center gap-1 disabled:opacity-50"
                                  title="Generar imagen con IA"
                                >
                                  <Sparkles size={14} />
                                  IA
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cantidad</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movements.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-sm">{m.product_name}</p>
                            <p className="text-xs text-slate-400 font-mono">{m.product_sku}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${m.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {m.type === 'IN' ? 'Entrada' : 'Salida'}
                            </span>
                          </td>
                          <td className={`px-6 py-4 font-bold text-sm ${m.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.type === 'IN' ? '+' : '-'}{m.quantity}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 italic">
                            {m.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'shop' && (
              <motion.div 
                key="shop"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Tienda Online</h2>
                    <p className="text-slate-500">Explora y adquiere nuestros productos directamente.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-100">
                    <ShoppingBag size={20} />
                    <span className="font-bold">Envío gratis en pedidos +$500</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
                      <div className="aspect-square bg-slate-100 flex items-center justify-center relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                        ) : (
                          <Box size={64} className="text-slate-300 group-hover:scale-110 transition-transform" />
                        )}
                        {product.stock <= 0 && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="bg-white text-rose-600 px-4 py-1 rounded-full font-bold text-xs uppercase tracking-widest">Agotado</span>
                          </div>
                        )}
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                          {product.category_name || 'General'}
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{product.name}</h3>
                          <p className="text-slate-500 text-sm line-clamp-2 mt-1">{product.description}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-slate-900">${product.price.toFixed(2)}</span>
                          <span className={`text-xs font-bold ${product.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {product.stock > 0 ? `${product.stock} disponibles` : 'Sin stock'}
                          </span>
                        </div>
                        <button 
                          disabled={product.stock <= 0}
                          onClick={() => addToCart(product)}
                          className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                            product.stock > 0 
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <ShoppingCart size={18} />
                          Añadir al Carrito
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold">Nuevo Producto</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="p-6 space-y-4">
              <div className="flex gap-6 mb-4">
                <div className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group">
                  {generatedImageUrl ? (
                    <img src={generatedImageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <>
                      <ImageIcon size={24} className="text-slate-300 mb-1" />
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Sin Imagen</span>
                    </>
                  )}
                  {isGeneratingImage && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 size={24} className="text-indigo-600 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-bold text-sm mb-1">Imagen del Producto</h3>
                  <p className="text-xs text-slate-500 mb-3">Genera una imagen profesional usando IA basada en el nombre y descripción.</p>
                  <button 
                    type="button"
                    onClick={() => {
                      const name = (document.getElementsByName('name')[0] as HTMLInputElement).value;
                      const desc = (document.getElementsByName('description')[0] as HTMLTextAreaElement).value;
                      if (!name) return alert('Introduce un nombre primero');
                      generateAIImage(name, desc);
                    }}
                    disabled={isGeneratingImage}
                    className="flex items-center gap-2 text-indigo-600 font-bold text-xs hover:text-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    {generatedImageUrl ? 'Regenerar con IA' : 'Generar con IA'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre</label>
                  <input name="name" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">SKU</label>
                  <input name="sku" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Precio</label>
                  <input name="price" type="number" step="0.01" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Stock Inicial</label>
                  <input name="stock" type="number" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Stock Mínimo</label>
                  <input name="min_stock" type="number" defaultValue="5" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Descripción</label>
                  <textarea name="description" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                Guardar Producto
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {isAdjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Ajustar Stock</h2>
                <p className="text-sm text-slate-500">{selectedProduct.name}</p>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipo de Movimiento</label>
                <select name="type" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="IN">Entrada (Compra/Devolución)</option>
                  <option value="OUT">Salida (Venta/Merma)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cantidad</label>
                <input name="quantity" type="number" min="1" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Motivo</label>
                <input name="reason" placeholder="Ej: Venta directa, Reposición..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                Confirmar Ajuste
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="text-emerald-600" />
                  <h2 className="text-xl font-bold">Tu Carrito</h2>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <ShoppingBag size={64} strokeWidth={1} />
                    <p className="font-medium">Tu carrito está vacío</p>
                    <button 
                      onClick={() => setIsCartOpen(false)}
                      className="text-indigo-600 font-bold text-sm hover:underline"
                    >
                      Seguir comprando
                    </button>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.product.id} className="flex gap-4">
                      <div className="w-20 h-20 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-200">
                        {item.product.image_url ? (
                          <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Box size={32} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-sm truncate">{item.product.name}</h3>
                          <button 
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">SKU: {item.product.sku}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-3 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                            <span className="text-xs font-bold px-2">{item.quantity} un.</span>
                          </div>
                          <span className="font-bold text-slate-900">${(item.product.price * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Subtotal</span>
                      <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Envío</span>
                      <span className="text-emerald-600 font-bold">{cartTotal >= 500 ? 'Gratis' : '$15.00'}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-bold text-2xl text-slate-900">
                        ${(cartTotal + (cartTotal >= 500 ? 0 : 15)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                  >
                    <CreditCard size={20} />
                    Finalizar Compra
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* ChatBot Floating Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-[350px] sm:w-[400px] h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden mb-2"
            >
              {/* Chat Header */}
              <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Asistente IA</h3>
                    <p className="text-[10px] text-indigo-100 uppercase font-bold tracking-wider">En línea</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles size={32} />
                    </div>
                    <h4 className="font-bold text-slate-800 mb-1">¡Hola! Soy tu asistente</h4>
                    <p className="text-xs text-slate-500 px-8">Pregúntame sobre el stock, precios o qué productos necesitan reposición.</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-white border border-slate-200 text-slate-600'
                      }`}>
                        {msg.role === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}
                      </div>
                      <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                      }`}>
                        <div className="markdown-body prose prose-sm max-w-none">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm">
                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe tu pregunta..."
                  className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-indigo-700 transition-colors relative"
        >
          {isChatOpen ? <X size={28} /> : <MessageSquare size={28} />}
          {!isChatOpen && chatMessages.length === 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
