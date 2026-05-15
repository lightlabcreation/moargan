const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');

// @desc    Get all users (Admin Only)
// @route   GET /api/users
const getUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      password_set: true,
      invitation_sent: true,
      invitation_token: true,
      status: true,
      phone: true,
      source: true,
      createdAt: true
    }
  });
  res.json({ success: true, users });
});

// @desc    Get single user profile
// @route   GET /api/users/:id
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      extra: true,
      special: true,
      source: true,
      createdAt: true,
    },
  });
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.json({ success: true, user });
});

// @desc    Update user profile
// @route   PATCH /api/users/:id
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, password, phone, extra, special, status } = req.body;

  const data = { name, email, phone, extra, special, status };
  if (password) {
    data.password = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data
  });

  res.json({ success: true, user });
});

// @desc    Update user status only
// @route   PATCH /api/users/:id/status
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const user = await prisma.user.update({
    where: { id },
    data: { status }
  });
  
  res.json({ success: true, user });
});

// @desc    Bulk Update user status
// @route   POST /api/users/bulk-status
const bulkUpdateStatus = asyncHandler(async (req, res) => {
  const { ids, status } = req.body;
  
  if (!ids || !Array.isArray(ids)) {
    res.status(400);
    throw new Error('Invalid IDs array');
  }

  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { status }
  });
  
  res.json({ success: true, message: `Updated ${ids.length} users to ${status}` });
});


// @desc    Delete user
// @route   DELETE /api/users/:id
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // 1. Delete associated data first to satisfy foreign key constraints
  await prisma.booking.deleteMany({ where: { user_id: id } });
  await prisma.notification.deleteMany({ where: { userId: id } });

  // 2. Safely delete the user (use deleteMany to avoid 404 error if already gone)
  await prisma.user.deleteMany({ where: { id } });
  
  res.json({ success: true, message: 'User and associated data removed.' });
});

// DESTINATIONS
// @desc    Get all destinations
// @route   GET /api/destinations
const getDestinations = asyncHandler(async (req, res) => {
  const destinations = await prisma.destination.findMany({
    orderBy: { name: 'asc' }
  });
  res.json({ success: true, destinations: destinations.map(d => d.name) });
});

// @desc    Add destination
// @route   POST /api/destinations
const addDestination = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const destination = await prisma.destination.create({ data: { name } });
  res.json({ success: true, destination });
});

// @desc    Delete destination (Fixed with Query Param Support)
// @route   DELETE /api/users/places?name=XYZ
const deleteDestination = asyncHandler(async (req, res) => {
  const name = req.query.name || req.body.name;
  console.log('🗑️ UI: ATTEMPTED TO DELETE:', name, `(Length: ${name?.length || 0})`);

  if (!name) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  try {
    // Aggressive Search: Try to catch it by name or part of name
    const result = await prisma.destination.deleteMany({
      where: {
        name: {
          contains: name.trim()
        }
      }
    });

    console.log(`✅ DB ACTION: Deleted ${result.count} rows matching "${name}"`);
    
    // Check if it's STILL there for any reason
    const check = await prisma.destination.findMany();
    console.log('📊 REMAINING TITLES:', check.map(d => `"${d.name}" (Len: ${d.name.length})`));

    res.json({ success: true, message: 'Removed' });
  } catch (error) {
    console.error('❌ DB ERROR:', error.message);
    res.status(500).json({ success: false });
  }
});

// NOTIFICATIONS
// @desc    Get user notifications
// @route   GET /api/users/:id/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const notifications = await prisma.notification.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, notifications });
});

// @desc    Mark notification as read
// @route   PATCH /api/users/notifications/:id
const markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });
  res.json({ success: true });
});

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  bulkUpdateStatus,
  deleteUser,
  getDestinations,
  addDestination,
  deleteDestination,
  getNotifications,
  markNotificationRead,
};

