const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
app.use(session({
  secret: 'sumusa_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 hour session
}));

// Serve Static Files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer Setup for Passport Photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/passports/'),
  filename: (req, file, cb) => {
    const regNo = req.body.student_reg_no ? req.body.student_reg_no.replace(/[/\\?%*:|"<>]/g, '_') : 'MEMBER';
    const ext = path.extname(file.originalname);
    cb(null, `${regNo}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);
    if (extName && mimeType) return cb(null, true);
    cb(new Error('Only JPEG, JPG, and PNG image files are allowed.'));
  }
});

// Middleware: Require Admin Session
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
};

// In-Memory Admin Password Hash (Default: Password123)
let adminPasswordHash = bcrypt.hashSync('Password123', 10);
const ADMIN_USERNAME = 'admin';

// --- AUTHENTICATION ROUTES ---

// Check Session Status
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ isAdmin: true, adminName: 'SUMUSA System Admin' });
  }
  res.json({ isAdmin: false });
});

// Admin Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, adminPasswordHash)) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: 'Login successful!' });
  }
  res.status(401).json({ success: false, message: 'Invalid username or password.' });
});

// Admin Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed.' });
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// Change Password
app.post('/api/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!bcrypt.compareSync(currentPassword, adminPasswordHash)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  adminPasswordHash = bcrypt.hashSync(newPassword, 10);
  res.json({ success: true, message: 'Password updated successfully!' });
});

// --- MEMBER DATABASE ROUTES ---

// 1. GET ALL MEMBERS (Ordered by Year Joined ASC)
app.get('/api/members', async (req, res) => {
  try {
    const search = req.query.search || '';
    let sql = 'SELECT * FROM members ORDER BY year_joined ASC, full_name ASC';
    let params = [];

    if (search) {
      sql = `SELECT * FROM members 
             WHERE full_name LIKE ? OR student_reg_no LIKE ? OR school LIKE ? OR contact LIKE ?
             ORDER BY year_joined ASC, full_name ASC`;
      const term = `%${search}%`;
      params = [term, term, term, term];
    }

    const [rows] = await db.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Fetch Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch members from database.' });
  }
});

// 2. ADD MEMBER (Admin Only)
app.post('/api/members', requireAdmin, upload.single('passport_photo'), async (req, res) => {
  try {
    const {
      student_reg_no,
      full_name,
      gender,
      email,
      contact,
      school,
      program,
      year_joined,
      association_role,
      membership_status
    } = req.body;

    const photoUrl = req.file ? `uploads/passports/${req.file.filename}` : 'uploads/passports/default.jpg';

    const sql = `
      INSERT INTO members 
      (student_reg_no, full_name, gender, email, contact, school, program, year_joined, association_role, passport_photo_url, membership_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(sql, [
      student_reg_no,
      full_name,
      gender,
      email || null,
      contact,
      school,
      program,
      year_joined,
      association_role || 'Member',
      photoUrl,
      membership_status || 'Active'
    ]);

    res.status(201).json({ success: true, message: 'Member registered successfully!' });
  } catch (error) {
    console.error('Registration Error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Student Registration Number already exists.' });
    }
    res.status(500).json({ success: false, message: error.message || 'Database error.' });
  }
});

// 3. UPDATE MEMBER (Admin Only)
app.put('/api/members/:regNo', requireAdmin, upload.single('passport_photo'), async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const {
      full_name,
      gender,
      email,
      contact,
      school,
      program,
      year_joined,
      association_role,
      membership_status
    } = req.body;

    let sql, params;

    if (req.file) {
      const photoUrl = `uploads/passports/${req.file.filename}`;
      sql = `UPDATE members SET 
              full_name = ?, gender = ?, email = ?, contact = ?, school = ?, program = ?, 
              year_joined = ?, association_role = ?, passport_photo_url = ?, membership_status = ? 
             WHERE student_reg_no = ?`;
      params = [full_name, gender, email || null, contact, school, program, year_joined, association_role, photoUrl, membership_status, regNo];
    } else {
      sql = `UPDATE members SET 
              full_name = ?, gender = ?, email = ?, contact = ?, school = ?, program = ?, 
              year_joined = ?, association_role = ?, membership_status = ? 
             WHERE student_reg_no = ?`;
      params = [full_name, gender, email || null, contact, school, program, year_joined, association_role, membership_status, regNo];
    }

    await db.execute(sql, params);
    res.json({ success: true, message: 'Member record updated successfully!' });
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update member record.' });
  }
});

// 4. DELETE MEMBER (Admin Only)
app.delete('/api/members/:regNo', requireAdmin, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    await db.execute('DELETE FROM members WHERE student_reg_no = ?', [regNo]);
    res.json({ success: true, message: 'Member record deleted successfully!' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete member record.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running smoothly on http://localhost:${PORT}`));