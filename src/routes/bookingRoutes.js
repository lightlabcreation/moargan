const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { createBooking, getUserBookings, cancelBooking } = require('../controllers/bookingController');

// All endpoints in this file are prefixed with /api/bookings
router.post('/', protect, createBooking);
router.get('/:userId', protect, getUserBookings);
router.delete('/:id', protect, cancelBooking);

module.exports = router;
