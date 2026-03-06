import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("inventory.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    category_id INTEGER,
    image_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('IN', 'OUT')) NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/stats", (req, res) => {
    const totalProducts = (db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number }).count;
    const lowStock = (db.prepare("SELECT COUNT(*) as count FROM products WHERE stock <= min_stock").get() as { count: number }).count;
    const totalValue = (db.prepare("SELECT SUM(price * stock) as value FROM products").get() as { value: number }).value || 0;
    const recentMovements = db.prepare(`
      SELECT m.*, p.name as product_name 
      FROM movements m 
      JOIN products p ON m.product_id = p.id 
      ORDER BY m.created_at DESC LIMIT 5
    `).all();

    res.json({ totalProducts, lowStock, totalValue, recentMovements });
  });

  // Ensure image_url column exists (migration)
  try {
    db.prepare("ALTER TABLE products ADD COLUMN image_url TEXT").run();
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }
  
  app.get("/api/products", (req, res) => {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
    `).all();
    res.json(products);
  });

  app.post("/api/products", (req, res) => {
    const { name, sku, description, price, stock, min_stock, category_id, image_url } = req.body;
    try {
      const info = db.prepare(`
        INSERT INTO products (name, sku, description, price, stock, min_stock, category_id, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, sku, description, price, stock, min_stock, category_id, image_url);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/products/:id", (req, res) => {
    const { id } = req.params;
    const { name, description, price, min_stock, category_id, image_url } = req.body;
    db.prepare(`
      UPDATE products 
      SET name = ?, description = ?, price = ?, min_stock = ?, category_id = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, price, min_stock, category_id, image_url, id);
    res.json({ success: true });
  });

  app.post("/api/inventory/adjust", (req, res) => {
    const { product_id, type, quantity, reason } = req.body;
    
    const dbTransaction = db.transaction(() => {
      // Update stock
      const modifier = type === 'IN' ? quantity : -quantity;
      db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(modifier, product_id);
      
      // Record movement
      db.prepare("INSERT INTO movements (product_id, type, quantity, reason) VALUES (?, ?, ?, ?)")
        .run(product_id, type, quantity, reason);
    });

    try {
      dbTransaction();
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/categories", (req, res) => {
    res.json(db.prepare("SELECT * FROM categories").all());
  });

  app.post("/api/categories", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/movements", (req, res) => {
    const movements = db.prepare(`
      SELECT m.*, p.name as product_name, p.sku as product_sku
      FROM movements m
      JOIN products p ON m.product_id = p.id
      ORDER BY m.created_at DESC
    `).all();
    res.json(movements);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
