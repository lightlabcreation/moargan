const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getShuttleLive,
  updateShift,
  updateTracking,
  updateLocation,
  getAdminShuttleDrivers,
  getEtaPreview,
} = require('../controllers/shuttleController');

router.get('/live', protect, getShuttleLive);
router.post('/shift', protect, updateShift);
router.patch('/tracking', protect, updateTracking);
router.patch('/location', protect, updateLocation);
router.get('/eta', protect, getEtaPreview);

router.get('/admin/drivers', protect, getAdminShuttleDrivers);

module.exports = router;
