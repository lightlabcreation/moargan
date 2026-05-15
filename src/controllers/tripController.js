const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');

const getAdminUsers = async () => {
  // Role data can be inconsistent in legacy rows (case/spacing), normalize in app logic.
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });
  return users.filter((u) => (u.role || '').trim().toLowerCase() === 'admin');
};

const getUsersByRole = async (targetRole) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });
  return users.filter((u) => (u.role || '').trim().toLowerCase() === targetRole);
};

const getUsersByRoles = async (targetRoles) => {
  const normalized = targetRoles.map((r) => r.trim().toLowerCase());
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });
  return users.filter((u) => normalized.includes((u.role || '').trim().toLowerCase()));
};

// @desc    Get all trips by date
// @route   GET /api/trips
const getTrips = asyncHandler(async (req, res) => {
  const { date } = req.query; // YYYY-MM-DD
  const trips = await prisma.trip.findMany({
    where: date 
      ? { 
          OR: [
            { date }, 
            { 
              is_recurring: true,
              date: { lte: date },
              OR: [
                { recurring_end_date: null },
                { recurring_end_date: { gte: date } }
              ]
            }
          ] 
        } 
      : {},
    include: {
      bookings: {
        include: { user: true }
      }
    },
    orderBy: { time: 'asc' }
  });
  res.json({ success: true, trips });
});

// @desc    Create new trip (Admin Only)
// @route   POST /api/trips
const createTrip = asyncHandler(async (req, res) => {
  const { time, date, origin, destination, seats_total, is_special, tenant_name, is_recurring } = req.body;

  const trip = await prisma.trip.create({
    data: {
      time,
      date,
      origin,
      destination,
      seats_total,
      seats_remaining: seats_total,
      is_special: is_special || false,
      is_recurring: is_recurring || false,
      tenant_name: tenant_name || null
    }
  });

  res.status(201).json({ success: true, trip });
});

// @desc    Manage special requests
// @route   POST /api/trips/request
const createRequest = asyncHandler(async (req, res) => {
  const { tenant_name, date, time, origin, destination, passengers, source, notes } = req.body;

  const request = await prisma.tripRequest.create({
    data: {
      tenant_name,
      date,
      time,
      origin,
      destination,
      passengers,
      source: source || 'tenant',
      notes: notes || ''
    }
  });

  // Notify admins
  const admins = await getAdminUsers();
  await prisma.notification.createMany({
    data: admins.map(a => ({
      userId: a.id,
      title: 'New Trip Request',
      body: `${tenant_name} requested a trip on ${date} at ${time}.`,
      icon: 'calendar-plus'
    }))
  });

  res.status(201).json({ success: true, request });
});


// @desc    Get all trip requests (Admin Only)
// @route   GET /api/trips/requests
const getRequests = asyncHandler(async (req, res) => {
  const requests = await prisma.tripRequest.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, requests });
});

// @desc    Update trip status (Driver/Admin)
// @route   PATCH /api/trips/:id
const updateTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, actual_passengers, notes, is_recurring, recurring_end_date } = req.body;

  const trip = await prisma.trip.update({
    where: { id },
    data: {
      status,
      is_recurring: is_recurring !== undefined ? is_recurring : undefined,
      recurring_end_date: recurring_end_date !== undefined ? recurring_end_date : undefined,
      actual_passengers: actual_passengers || undefined,
      notes: notes || undefined
    },
    include: { bookings: true } // Include bookings to find users
  });

  // If completed, notify booked users
  if (status === 'completed') {
    const notifyUsers = trip.bookings.filter(b => b.status === 'confirmed').map(b => b.user_id);
    if (notifyUsers.length > 0) {
      await prisma.notification.createMany({
        data: notifyUsers.map(uId => ({
          userId: uId,
          title: 'Trip Completed',
          body: `Your trip from ${trip.origin} was completed.`,
          icon: 'check-circle'
        }))
      });
    }

    // Also notify admins
    const admins = await getAdminUsers();
    await prisma.notification.createMany({
      data: admins.map(a => ({
        userId: a.id,
        title: 'Trip Logged',
        body: `Trip ${trip.origin} → ${trip.destination} was completed by driver.`,
        icon: 'clipboard-text-outline'
      }))
    });
  }

  res.json({ success: true, trip });
});


// @desc    Delete trip (Admin Only)
// @route   DELETE /api/trips/:id
const deleteTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingTrip = await prisma.trip.findUnique({ where: { id } });
  if (!existingTrip) {
    return res.status(404).json({ success: false, message: 'Trip not found.' });
  }

  // Remove dependent rows first to avoid FK constraint failures.
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { trip_id: id } }),
    prisma.trip.delete({ where: { id } }),
  ]);

  res.json({ success: true, message: 'Trip and related bookings deleted.' });
});

// @desc    Approve trip request (Admin Only)
// @route   POST /api/trips/requests/:id/approve
const approveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find the request
  const request = await prisma.tripRequest.findUnique({ where: { id } });
  if (!request) {
    res.status(404);
    throw new Error('Request not found');
  }

  // 2. Update request status
  await prisma.tripRequest.update({
    where: { id },
    data: { status: 'approved' }
  });

  // 3. Create a NEW trip based on this request
  // Keep seats open according to requested passenger count so it does not appear FULL immediately.
  const requestedSeats = Math.max(parseInt(request.passengers, 10) || 1, 1);
  const trip = await prisma.trip.create({
    data: {
      time: request.time,
      date: request.date,
      origin: request.origin,
      destination: request.destination,
      seats_total: requestedSeats,
      seats_remaining: requestedSeats,
      status: 'scheduled',
      is_special: true,
      tenant_name: request.tenant_name
    }
  });

  // 4. Notify the requesting resident (if we can identify by name) and all drivers.
  // Notify all tenant/resident users to avoid missing alerts due to name mismatches.
  const tenantUsers = await getUsersByRoles(['tenant', 'resident']);

  if (tenantUsers.length > 0) {
    await prisma.notification.createMany({
      data: tenantUsers.map((u) => ({
        userId: u.id,
        title: 'Request Approved',
        body: `Your requested trip for ${request.date} at ${request.time} has been approved.`,
        icon: 'check-circle'
      }))
    });
  }

  const drivers = await getUsersByRole('driver');
  if (drivers.length > 0) {
    await prisma.notification.createMany({
      data: drivers.map((d) => ({
        userId: d.id,
        title: 'New Trip Assigned',
        body: `A new trip is scheduled on ${request.date} at ${request.time}: ${request.origin} → ${request.destination}.`,
        icon: 'bus-clock'
      }))
    });
  }

  res.json({ success: true, trip });
});

// @desc    Delete trip request
// @route   DELETE /api/trips/requests/:id
const deleteRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.tripRequest.delete({ where: { id } });
  res.json({ success: true, message: 'Request deleted.' });
});

// @desc    Reject trip request (Admin Only)
// @route   POST /api/trips/requests/:id/reject
const rejectRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const request = await prisma.tripRequest.update({
    where: { id },
    data: { status: 'rejected' }
  });

  // Notify the requesting resident that their request was rejected.
  const tenantUsers = await getUsersByRoles(['tenant', 'resident']);

  if (tenantUsers.length > 0) {
    await prisma.notification.createMany({
      data: tenantUsers.map((u) => ({
        userId: u.id,
        title: 'Request Rejected',
        body: `Your requested trip for ${request.date} at ${request.time} was not approved.`,
        icon: 'close-circle'
      }))
    });
  }

  res.json({ success: true, request });
});

// @desc    Update live GPS location of a trip (Driver only)
// @route   PATCH /api/trips/:id/location
const updateLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined) {
    res.status(400);
    throw new Error('lat and lng are required');
  }

  const trip = await prisma.trip.update({
    where: { id },
    data: { lat: parseFloat(lat), lng: parseFloat(lng) }
  });

  res.json({ success: true, trip });
});

// @desc    Start a trip (Driver) — sets status to in_progress
// @route   PATCH /api/trips/:id/start
const startTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tripWithBookings = await prisma.trip.findUnique({
    where: { id },
    include: { bookings: true },
  });
  if (!tripWithBookings) {
    res.status(404);
    throw new Error('Trip not found');
  }
  const confirmedCount = (tripWithBookings.bookings || []).filter((b) => b.status === 'confirmed').length;
  if (confirmedCount <= 0) {
    res.status(400);
    throw new Error('Cannot start trip without resident booking');
  }

  const trip = await prisma.trip.update({
    where: { id },
    data: { status: 'in_progress', lat: null, lng: null },
    include: { bookings: true }
  });

  // Notify booked users that trip has started
  const notifyUsers = trip.bookings.filter(b => b.status === 'confirmed').map(b => b.user_id);
  if (notifyUsers.length > 0) {
    await prisma.notification.createMany({
      data: notifyUsers.map(uId => ({
        userId: uId,
        title: 'Shuttle Started',
        body: `The shuttle for your trip from ${trip.origin} has started. Track it live now!`,
        icon: 'bus'
      }))
    });
  }

  res.json({ success: true, trip });
});


module.exports = { getTrips, createTrip, createRequest, getRequests, updateTrip, deleteTrip, approveRequest, deleteRequest, rejectRequest, updateLocation, startTrip };
