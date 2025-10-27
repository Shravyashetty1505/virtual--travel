// Enhanced server.js with sessions, bookings, reviews, admin panel
require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using HTTPS
  })
);

// Database connection
let db;

// Test database on startup
async function testConnection() {
  console.log('\n🔍 Testing Database Connection...');
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('DB_PASS:', process.env.DB_PASS ? '***hidden***' : 'NOT SET');
  
  try {
    const testDb = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'travelsphere',
    });
    console.log('✅ Database connected!');
    
    const [rows] = await testDb.execute('SHOW TABLES');
    console.log('✅ Tables found:', rows.map(r => Object.values(r)[0]));
    
    const [users] = await testDb.execute('SELECT COUNT(*) as count FROM users');
    console.log('✅ Users in database:', users[0].count);
    
    await testDb.end();
  } catch (err) {
    console.error('❌ DATABASE ERROR:', err.message);
    console.error('❌ Error code:', err.code);
  }
  console.log('---\n');
}

async function initDB() {
  await testConnection(); // Run test first
  
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'travelsphere',
    });
    console.log('✅ Database connected successfully!');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('❌ Error code:', err.code);
    process.exit(1);
  }
}

// Routes

// Home - serve registration page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

// Dashboard
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// User registration (FIXED ENDPOINT AND FIELDS)
app.post('/api/register', async (req, res) => {
  console.log('📝 Registration attempt:', req.body);

  const { name, email, password, dob } = req.body;

  if (!name || !email || !password || !dob) {
    console.log('❌ Missing fields');
    return res.json({ success: false, error: 'All fields required' });
  }

  // Age validation
  if (dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      console.log('❌ User under 18');
      return res.json({ success: false, error: 'You must be at least 18 years old to register.' });
    }
  }

  try {
    console.log('🔍 Checking if email exists...');
    // Check if email already exists
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existing.length > 0) {
      console.log('❌ Email already exists');
      return res.json({ success: false, error: 'Email already registered' });
    }

    console.log('🔐 Hashing password...');
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('💾 Inserting user into database...');
    // Insert user (matching your database schema)
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, dob) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, dob || null]
    );
    
    console.log('✅ User registered successfully! ID:', result.insertId);
    res.json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    console.error('❌ Registration error DETAILS:', err.message);
    console.error('Error code:', err.code);
    console.error('SQL State:', err.sqlState);
    console.error('Full error:', err);
    res.json({ success: false, error: `Server error: ${err.message}` });
  }
});

// User login (FIXED ENDPOINT AND RESPONSE FORMAT)
app.post('/api/login', async (req, res) => {
  console.log('🔑 Login attempt:', { identifier: req.body.identifier });
  
  const { identifier, password } = req.body;
  
  if (!identifier || !password) {
    console.log('❌ Missing fields');
    return res.json({ success: false, error: 'All fields required' });
  }

  try {
    console.log('🔍 Looking up user...');
    // Check by email (your schema uses email)
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [identifier]
    );
    
    if (rows.length === 0) {
      console.log('❌ User not found');
      return res.json({ success: false, error: 'Invalid email or password' });
    }

    console.log('✅ User found:', rows[0].email);
    console.log('🔐 Comparing passwords...');
    
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      console.log('❌ Password mismatch');
      return res.json({ success: false, error: 'Invalid email or password' });
    }

    console.log('✅ Password matched! Creating session...');
    
    // Set session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.isStudent = user.is_student;
    req.session.isAdmin = user.is_admin;
    
    console.log('✅ Login successful for:', user.email);
    
    res.json({ 
      success: true, 
      message: 'Login successful!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('❌ Login error DETAILS:', err.message);
    console.error('Full error:', err);
    res.json({ success: false, error: `Server error: ${err.message}` });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check session
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({
      loggedIn: true,
      user: {
        id: req.session.userId,
        name: req.session.userName,
        email: req.session.userEmail,
        isStudent: req.session.isStudent,
        isAdmin: req.session.isAdmin
      }
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Admin login
app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Invalid admin credentials' });
  }
});

// Create booking
app.post('/api/book', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, error: 'Please login first' });
  }

  const { booking_type, item_name, price, details, travel_date } = req.body;
  
  try {
    await db.execute(
      'INSERT INTO bookings (user_id, booking_type, item_name, price, details, travel_date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.userId, booking_type, item_name, price, JSON.stringify(details), travel_date]
    );
    res.json({ success: true, message: 'Booking successful!' });
  } catch (err) {
    console.error('Booking error:', err);
    res.json({ success: false, error: 'Booking failed. Please try again.' });
  }
});

// Add review
app.post('/api/review', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, error: 'Please login first' });
  }

  const { booking_id, rating, comment } = req.body;
  
  try {
    await db.execute(
      'INSERT INTO reviews (user_id, booking_id, rating, comment) VALUES (?, ?, ?, ?)',
      [req.session.userId, booking_id, rating, comment]
    );
    res.json({ success: true, message: 'Review added!' });
  } catch (err) {
    console.error('Review error:', err);
    res.json({ success: false, error: 'Failed to add review' });
  }
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});