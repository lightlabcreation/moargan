const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');

// @desc    Log fuel activity
// @route   POST /api/logs/fuel
const createFuelLog = asyncHandler(async (req, res) => {
  const { date, vehicle, amount, cost, odometer, gallons } = req.body;
  
  // Clean values: remove currency symbols and parse
  const cleanCost = typeof cost === 'string' ? cost.replace(/[^0-9.]/g, '') : cost;
  const cleanAmount = typeof amount === 'string' ? amount.replace(/[^0-9.]/g, '') : amount;
  const cleanGallons = typeof gallons === 'string' ? gallons.replace(/[^0-9.]/g, '') : gallons;
  const cleanOdo = typeof odometer === 'string' ? odometer.replace(/[^0-9.]/g, '') : odometer;

  const log = await prisma.fuelLog.create({
    data: { 
      date, 
      vehicle: vehicle || 'Shuttle #01', 
      gallons: parseFloat(cleanGallons || cleanAmount || 0), // Use amount as quantity if gallons missing
      amount: parseFloat(cleanCost || 0),                   // Map current UI "cost" to "amount" field
      odometer: parseFloat(cleanOdo || 0) 
    }
  });
  res.status(201).json({ success: true, log });
});

// @desc    Log maintenance activity
// @route   POST /api/logs/maintenance
const createMaintLog = asyncHandler(async (req, res) => {
  const { date, vehicle, description, type, cost } = req.body;
  
  const cleanCost = typeof cost === 'string' ? cost.replace(/[^0-9.]/g, '') : cost;

  const log = await prisma.maintenanceLog.create({
    data: { 
      date, 
      vehicle: vehicle || 'Shuttle #01', 
      description: description || type || 'General Maintenance', 
      cost: parseFloat(cleanCost || 0) 
    }
  });
  res.status(201).json({ success: true, log });
});

// @desc    Get all logs for Admin
// @route   GET /api/logs
const getLogs = asyncHandler(async (req, res) => {
  const fuelLogs = await prisma.fuelLog.findMany({ orderBy: { createdAt: 'desc' } });
  const maintLogs = await prisma.maintenanceLog.findMany({ orderBy: { createdAt: 'desc' } });
  
  // Map fields for UI consistency if needed
  const mappedFuel = fuelLogs.map(l => ({
    ...l,
    cost: '$' + l.amount,
    amount: l.gallons + ' L'
  }));

  const mappedMaint = maintLogs.map(l => ({
    ...l,
    type: l.description,
    notes: l.description,
    cost: '$' + l.cost
  }));

  res.json({ success: true, fuelLogs: mappedFuel, maintLogs: mappedMaint });
});

// @desc    Delete fuel log
// @route   DELETE /api/logs/fuel/:id
const deleteFuelLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.fuelLog.delete({ where: { id } });
  res.json({ success: true, message: 'Fuel log deleted.' });
});

// @desc    Delete maintenance log
// @route   DELETE /api/logs/maintenance/:id
const deleteMaintLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.maintenanceLog.delete({ where: { id } });
  res.json({ success: true, message: 'Maintenance log deleted.' });
});

module.exports = { createFuelLog, createMaintLog, getLogs, deleteFuelLog, deleteMaintLog };
