// Enhanced server.js with sessions, bookings, reviews, admin panel
require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'travelsphere-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // set true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'travelsphere',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Middleware to check admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check
app.get('/ping', (req, res) => res.send('pong'));

// Register route
app.post('/api/register', async (req, res) => {
  try {
    const { name, dob, email, password, isStudent } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email exists
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (rows.length) return res.status(409).json({ error: 'Email already registered' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (name, dob, email, password, is_student, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, dob || null, email.toLowerCase(), hashedPassword, isStudent || false]
    );

    return res.json({ success: true, message: 'Registered successfully' });
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR LOWER(name) = ?',
      [identifier.toLowerCase(), identifier.toLowerCase()]
    );

    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Set session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.isStudent = user.is_student;
    req.session.isAdmin = user.is_admin;

    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email,
        isStudent: user.is_student,
        isAdmin: user.is_admin
      } 
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

// Get current user
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, dob, is_student, is_admin, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );
    
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('Get user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create booking
app.post('/api/bookings', requireAuth, async (req, res) => {
  try {
    const { type, itemName, price, details, travelDate } = req.body;
    
    if (!type || !itemName || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, booking_type, item_name, price, details, travel_date, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', NOW())`,
      [req.session.userId, type, itemName, price, JSON.stringify(details || {}), travelDate || null]
    );

    res.json({ 
      success: true, 
      bookingId: result.insertId,
      message: 'Booking created successfully' 
    });
  } catch (err) {
    console.error('Create booking error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user bookings
app.get('/api/bookings', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC`,
      [req.session.userId]
    );

    // Parse JSON details
    const bookings = rows.map(b => ({
      ...b,
      details: typeof b.details === 'string' ? JSON.parse(b.details) : b.details
    }));

    res.json({ success: true, bookings });
  } catch (err) {
    console.error('Get bookings error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel booking
app.patch('/api/bookings/:id/cancel', requireAuth, async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE bookings SET status = "cancelled" WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) {
    console.error('Cancel booking error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add review
app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify booking belongs to user
    const [booking] = await pool.query(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [bookingId, req.session.userId]
    );

    if (!booking.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await pool.query(
      'INSERT INTO reviews (user_id, booking_id, rating, comment, created_at) VALUES (?, ?, ?, ?, NOW())',
      [req.session.userId, bookingId, rating, comment || null]
    );

    res.json({ success: true, message: 'Review added' });
  } catch (err) {
    console.error('Add review error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for item
app.get('/api/reviews/:itemName', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as user_name FROM reviews r 
       JOIN users u ON r.user_id = u.id 
       JOIN bookings b ON r.booking_id = b.id 
       WHERE b.item_name = ? 
       ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.itemName]
    );

    res.json({ success: true, reviews: rows });
  } catch (err) {
    console.error('Get reviews error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add to favorites
app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { itemType, itemName, itemDetails } = req.body;

    await pool.query(
      'INSERT INTO favorites (user_id, item_type, item_name, item_details, created_at) VALUES (?, ?, ?, ?, NOW())',
      [req.session.userId, itemType, itemName, JSON.stringify(itemDetails || {})]
    );

    res.json({ success: true, message: 'Added to favorites' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Already in favorites' });
    }
    console.error('Add favorite error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user favorites
app.get('/api/favorites', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );

    const favorites = rows.map(f => ({
      ...f,
      item_details: typeof f.item_details === 'string' ? JSON.parse(f.item_details) : f.item_details
    }));

    res.json({ success: true, favorites });
  } catch (err) {
    console.error('Get favorites error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== ADMIN ROUTES =====

// Get all users (admin)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, is_student, is_admin, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error('Get users error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all bookings (admin)
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name as user_name, u.email as user_email 
       FROM bookings b 
       JOIN users u ON b.user_id = u.id 
       ORDER BY b.created_at DESC`
    );

    const bookings = rows.map(b => ({
      ...b,
      details: typeof b.details === 'string' ? JSON.parse(b.details) : b.details
    }));

    res.json({ success: true, bookings });
  } catch (err) {
    console.error('Get all bookings error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard stats (admin)
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [bookingCount] = await pool.query('SELECT COUNT(*) as count FROM bookings');
    const [revenue] = await pool.query('SELECT SUM(price) as total FROM bookings WHERE status = "confirmed"');
    const [recentBookings] = await pool.query(
      `SELECT b.*, u.name as user_name FROM bookings b 
       JOIN users u ON b.user_id = u.id 
       ORDER BY b.created_at DESC LIMIT 5`
    );

    res.json({
      success: true,
      stats: {
        totalUsers: userCount[0].count,
        totalBookings: bookingCount[0].count,
        totalRevenue: revenue[0].total || 0,
        recentBookings
      }
    });
  } catch (err) {
    console.error('Get stats error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (admin)
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { isAdmin, isStudent } = req.body;
    
    await pool.query(
      'UPDATE users SET is_admin = ?, is_student = ? WHERE id = ?',
      [isAdmin || false, isStudent || false, req.params.id]
    );

    res.json({ success: true, message: 'User updated' });
  } catch (err) {
    console.error('Update user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  // Hardcoded for now — you can later store in MySQL if you want
  if (username === "admin" && password === "admin123") {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Features enabled: Sessions, Bookings, Reviews, Admin Panel');
});