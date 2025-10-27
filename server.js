// Enhanced server.js with sessions, bookings, reviews, and admin panel
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
    cookie: { secure: false } // set true only if HTTPS
  })
);

// Database connection variable
let db;

// ✅ Function to test DB connection before starting server
async function testConnection() {
  console.log('\n🔍 Testing Database Connection...');
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('DB_PASS:', process.env.DB_PASSWORD ? '***hidden***' : 'NOT SET');

  try {
    const testDb = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'travelsphere',
      port: process.env.DB_PORT || 3306,
    });

    console.log('✅ Database connected!');

    const [tables] = await testDb.execute('SHOW TABLES');
    console.log('✅ Tables found:', tables.map(t => Object.values(t)[0]));

    await testDb.end();
  } catch (err) {
    console.error('❌ DATABASE ERROR:', err.message);
    console.error('❌ Error code:', err.code);
  }
  console.log('---\n');
}

// ✅ Initialize persistent DB connection
async function initDB() {
  await testConnection();

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'travelsphere',
      port: process.env.DB_PORT || 3306,
    });
    console.log('✅ Database connection established successfully!');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('❌ Error code:', err.code);
    process.exit(1);
  }
}

// ======================== ROUTES ========================

// Home page → Registration
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

// Dashboard
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ======================== REGISTER ========================
app.post('/api/register', async (req, res) => {
  console.log('📝 Registration attempt:', req.body);

  const { name, email, password, dob } = req.body;
  if (!name || !email || !password || !dob) {
    return res.json({ success: false, error: 'All fields are required.' });
  }

  // Validate age >= 18
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  if (age < 18) {
    return res.json({ success: false, error: 'You must be at least 18 years old.' });
  }

  try {
    const [exists] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length > 0) {
      return res.json({ success: false, error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute(
      'INSERT INTO users (name, email, password, dob) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, dob]
    );

    console.log('✅ Registration successful!');
    res.json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.json({ success: false, error: 'Server error during registration.' });
  }
});

// ======================== LOGIN ========================
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.json({ success: false, error: 'All fields are required.' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [identifier]);
    if (rows.length === 0) return res.json({ success: false, error: 'Invalid email or password.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, error: 'Invalid email or password.' });

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.isStudent = user.is_student;
    req.session.isAdmin = user.is_admin;

    res.json({
      success: true,
      message: 'Login successful!',
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.json({ success: false, error: 'Server error during login.' });
  }
});

// ======================== LOGOUT ========================
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.json({ success: false, error: 'Logout failed.' });
    res.json({ success: true, message: 'Logged out successfully!' });
  });
});

// ======================== SESSION CHECK ========================
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

// ======================== ADMIN LOGIN ========================
app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Invalid admin credentials' });
  }
});

// ======================== BOOKING ========================
app.post('/api/book', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, error: 'Please login first.' });
  }

  const { booking_type, item_name, price, details, travel_date } = req.body;

  try {
    await db.execute(
      'INSERT INTO bookings (user_id, booking_type, item_name, price, details, travel_date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.userId, booking_type, item_name, price, JSON.stringify(details), travel_date]
    );
    res.json({ success: true, message: 'Booking successful!' });
  } catch (err) {
    console.error('❌ Booking error:', err);
    res.json({ success: false, error: 'Booking failed. Try again.' });
  }
});

// ======================== REVIEWS ========================
app.post('/api/review', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, error: 'Please login first.' });
  }

  const { booking_id, rating, comment } = req.body;

  try {
    await db.execute(
      'INSERT INTO reviews (user_id, booking_id, rating, comment) VALUES (?, ?, ?, ?)',
      [req.session.userId, booking_id, rating, comment]
    );
    res.json({ success: true, message: 'Review added successfully!' });
  } catch (err) {
    console.error('❌ Review error:', err);
    res.json({ success: false, error: 'Failed to add review.' });
  }
});

// ======================== START SERVER ========================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
