const express = require('express');
const router = express.Router();
const { syncPMS } = require('../controllers/syncController');

// Sync PMS (Admin Only - check if admin role present)
router.post('/pms', syncPMS);

module.exports = router;
