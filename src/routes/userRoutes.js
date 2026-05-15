const express = require('express');
const router = express.Router();
const { 
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
  markNotificationRead
} = require('../controllers/userController');

// Destinations (Move specific routes BEFORE generic ones!)
router.get('/places', getDestinations);
router.post('/places', addDestination);
router.delete('/places', deleteDestination);

// Notifications
router.get('/:id/notifications', getNotifications);
router.patch('/notifications/:id', markNotificationRead);

// User Management
router.get('/', getUsers);
router.post('/bulk-status', bulkUpdateStatus); // Added bulk
router.get('/:id', getUserById);
router.patch('/:id', updateUser);
router.patch('/:id/status', updateUserStatus); // Added specialized status
router.delete('/:id', deleteUser);

module.exports = router;

