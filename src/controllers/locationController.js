const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');

// @desc    Get all shuttle locations
// @route   GET /api/admin/shuttle/locations
const getLocations = asyncHandler(async (req, res) => {
  const locations = await prisma.destination.findMany({
    orderBy: { name: 'asc' }
  });
  res.json({ success: true, locations });
});

// @desc    Add new shuttle location
// @route   POST /api/admin/shuttle/locations
const addLocation = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Location name is required');
  }

  try {
    const location = await prisma.destination.create({
      data: { name }
    });
    res.status(201).json({ success: true, location });
  } catch (error) {
    if (error.code === 'P2002') {
      res.status(400);
      throw new Error('This location already exists');
    }
    throw error;
  }
});

// @desc    Update shuttle location
// @route   PUT /api/admin/shuttle/locations/:id
const updateLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const location = await prisma.destination.update({
      where: { id },
      data: { name }
    });
    res.json({ success: true, location });
  } catch (error) {
    if (error.code === 'P2002') {
      res.status(400);
      throw new Error('Another location already has this name');
    }
    throw error;
  }
});

// @desc    Delete shuttle location
// @route   DELETE /api/admin/shuttle/locations/:id
const deleteLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.destination.delete({
    where: { id }
  });

  res.json({ success: true, message: 'Location deleted' });
});

module.exports = {
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation
};
