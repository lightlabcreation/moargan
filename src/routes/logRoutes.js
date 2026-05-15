const express = require('express');
const router = express.Router();
const { createFuelLog, createMaintLog, getLogs, deleteFuelLog, deleteMaintLog } = require('../controllers/logController');

// All endpoints in this file are prefixed with /api/logs
router.post('/fuel', createFuelLog);
router.post('/maintenance', createMaintLog);
router.get('/', getLogs);
router.delete('/fuel/:id', deleteFuelLog);
router.delete('/maintenance/:id', deleteMaintLog);

module.exports = router;
