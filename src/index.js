const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// CCTV: Log every single request that hits the server
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.url}`);
  next();
});

// Routes Implementation
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trips', require('./routes/tripRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/logs', require('./routes/logRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sync', require('./routes/syncRoutes'));
app.use('/api/shuttle', require('./routes/shuttleRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Morgan Shuttle Server running on 0.0.0.0:${PORT}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { prisma };
