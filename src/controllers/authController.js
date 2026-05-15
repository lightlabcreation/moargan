const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { getAuthUser } = require('../utils/authUser');

// @desc    Internal Admin Creation of Driver/Admin staff
// @route   POST /api/auth/internal-create
// @access  Private (Admin Only)
const internalCreate = asyncHandler(async (req, res) => {
  const { name, email, role } = req.body;

  const userExists = await prisma.user.findUnique({ where: { email } });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role, // driver, admin
      source: 'INTERNAL',
      password_set: false,
      invitation_sent: false
    }
  });

  res.status(201).json({ success: true, user });
});

// @desc    Setup Password with Invitation Token
// @route   POST /api/auth/setup-password
// @access  Public (Token Required)
const setupPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await prisma.user.findUnique({ where: { invitation_token: token } });

  if (!user || (user.token_expiry && new Date(user.token_expiry) < new Date())) {
    res.status(400);
    throw new Error('Invalid or expired invitation token');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      password_set: true,
      invitation_token: null,
      token_expiry: null
    }
  });

  res.status(200).json({ success: true, message: 'Password set successfully. You can now login.' });
});

// @desc    Standard Login with Email/Password
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Security Logic Checks
  if (user.status === 'INACTIVE') {
    res.status(403);
    throw new Error('Access Denied: Your account has been disabled by the administrator.');
  }

  if (!user.invitation_sent) {
    res.status(403);
    throw new Error('Access Denied: You have not been invited to the app yet.');
  }

  if (!user.password_set) {
    res.status(403);
    throw new Error('Action Required: Please set your password using the invitation link.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '30d'
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      extra: user.extra || '',
      special: user.special || '',
      source: user.source || 'INTERNAL',
    },
    token
  });
});

// @desc    Send/Generate Invitation Token
// @route   POST /api/auth/send-invitation
// @access  Private (Admin Only)
const sendInvitation = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const token = Math.random().toString(36).substr(2, 9);
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      invitation_sent: true,
      invitation_token: token,
      token_expiry: expiry.toISOString()
    }
  });

  res.json({ success: true, token, expiry });
});

// @desc    Forgot Password - Generates a token for the user
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(404);
    throw new Error('User with this email does not exist');
  }

  const token = Math.random().toString(36).substr(2, 9);
  const expiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1h expiry for reset

  await prisma.user.update({
    where: { id: user.id },
    data: {
      invitation_token: token,
      token_expiry: expiry.toISOString()
    }
  });

  // Create an in-app notification for the user
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Password Reset Request',
      body: `Someone requested a password reset. Your token is: ${token}`,
      icon: 'key-variant'
    }
  });

  // In a real app, you would send this token via email here.
  // Returning it directly for the demo as requested by user ("direct hi se").
  res.json({ success: true, token, message: 'Reset token generated successfully' });
});

// @desc    Check if user is still active (Heartbeat)
// @route   GET /api/auth/validate-status
// @access  Private
const validateStatus = asyncHandler(async (req, res) => {
  const decoded = getAuthUser(req);
  if (!decoded) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  
  if (!user) {
    res.status(401);
    throw new Error('User not found');
  }

  if (user.status === 'INACTIVE') {
    res.status(401);
    throw new Error('Account Disabled: Your access has been revoked by the admin.');
  }

  res.json({ success: true, status: user.status });
});

module.exports = { internalCreate, setupPassword, login, sendInvitation, forgotPassword, validateStatus };
