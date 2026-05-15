const express = require('express');
const router = express.Router();
const { getAdminShuttleDrivers } = require('../controllers/shuttleController');

router.get('/shuttle/drivers', getAdminShuttleDrivers);

module.exports = router;
