const asyncHandler = require('express-async-handler');
const prisma = require('../utils/prisma');
const { getAuthUser } = require('../utils/authUser');

const LIVE_STATUS = {
  OFFLINE: 'offline',
  ACTIVE: 'active',
  PAUSED: 'paused',
};

const driverSessions = new Map();

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const ensureDriverSession = (driverId, defaults = {}) => {
  const prev = driverSessions.get(driverId) || {
    driverId,
    driverName: defaults.driverName || 'Driver',
    shiftActive: false,
    trackingOn: false,
    paused: false,
    lat: null,
    lng: null,
    updatedAt: null,
  };
  if (defaults.driverName && !prev.driverName) prev.driverName = defaults.driverName;
  driverSessions.set(driverId, prev);
  return prev;
};

const getStatus = (session) => {
  if (!session?.shiftActive) return LIVE_STATUS.OFFLINE;
  if (session?.paused) return LIVE_STATUS.PAUSED;
  if (!session?.trackingOn) return LIVE_STATUS.OFFLINE;
  return LIVE_STATUS.ACTIVE;
};

const serializeLive = (session) => ({
  status: getStatus(session),
  shift_active: !!session?.shiftActive,
  tracking_on: !!session?.trackingOn,
  paused: !!session?.paused,
  lat: session?.lat ?? null,
  lng: session?.lng ?? null,
  updated_at: session?.updatedAt || null,
  driver_id: session?.driverId || null,
  driver_name: session?.driverName || null,
});

const isFresh = (updatedAt, maxAgeMs) => {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
};

const getActiveLiveSessions = () => {
  const sessions = [...driverSessions.values()];
  return sessions.filter((s) => {
    if (getStatus(s) !== LIVE_STATUS.ACTIVE) return false;
    // Coordinates are required for map rendering.
    if (!Number.isFinite(Number(s.lat)) || !Number.isFinite(Number(s.lng))) return false;
    // Ignore stale points so OFF-duty/paused drivers are not shown as live forever.
    return isFresh(s.updatedAt, 3 * 60 * 1000);
  });
};

const getCurrentDriver = async (req) => {
  const authUser = getAuthUser(req);
  if (authUser?.id) {
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, name: true, role: true },
    });
    if (user && ['driver', 'staff'].includes(normalizeRole(user.role))) return user;
  }
  const fallbackDriverId = String(req.body?.driver_id || req.query?.driver_id || 'driver-default');
  return { id: fallbackDriverId, name: req.body?.driver_name || 'Driver', role: 'driver' };
};

const getShuttleLive = asyncHandler(async (_req, res) => {
  const activeSessions = getActiveLiveSessions();
  if (activeSessions.length > 0) {
    const sorted = activeSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const allLive = sorted.map(serializeLive);
    return res.json({ success: true, live: allLive[0], live_drivers: allLive.length, lives: allLive });
  }

  // Backward compatibility:
  // if no in-memory sessions exist (e.g. server restart), serve only very fresh trip GPS.
  const knownDrivers = driverSessions.size;
  if (knownDrivers === 0) {
    const tripLive = await prisma.trip.findFirst({
      where: { status: 'in_progress', lat: { not: null }, lng: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { lat: true, lng: true, updatedAt: true, id: true },
    });
    if (tripLive && isFresh(tripLive.updatedAt, 2 * 60 * 1000)) {
      return res.json({
        success: true,
        live: {
          status: LIVE_STATUS.ACTIVE,
          shift_active: true,
          tracking_on: true,
          paused: false,
          lat: tripLive.lat,
          lng: tripLive.lng,
          updated_at: tripLive.updatedAt,
          trip_id: tripLive.id,
        },
        live_drivers: 1,
        lives: [
          {
            status: LIVE_STATUS.ACTIVE,
            shift_active: true,
            tracking_on: true,
            paused: false,
            lat: tripLive.lat,
            lng: tripLive.lng,
            updated_at: tripLive.updatedAt,
            trip_id: tripLive.id,
          },
        ],
      });
    }
  }
  return res.json({
    success: true,
    live: { status: LIVE_STATUS.OFFLINE, shift_active: false, tracking_on: false, paused: false },
    live_drivers: 0,
    lives: [],
  });
});

const updateShift = asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!['start', 'end'].includes(String(action || '').toLowerCase())) {
    res.status(400);
    throw new Error('action must be start or end');
  }

  const driver = await getCurrentDriver(req);
  const session = ensureDriverSession(driver.id, { driverName: driver.name });
  const start = String(action).toLowerCase() === 'start';
  session.shiftActive = start;
  session.trackingOn = start ? true : false;
  session.paused = false;
  if (!start) {
    session.lat = null;
    session.lng = null;
  }
  session.updatedAt = new Date().toISOString();

  const admins = await prisma.user.findMany({
    where: { role: { in: ['admin', 'super_admin', 'staff'] } },
    select: { id: true },
  });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: start ? 'Driver Started Shift' : 'Driver Ended Shift',
        body: `${driver.name} is now ${start ? 'active' : 'offline'}.`,
        icon: start ? 'bus-clock' : 'bus-stop',
      })),
    });
  }

  res.json({ success: true, live: serializeLive(session) });
});

const updateTracking = asyncHandler(async (req, res) => {
  const { tracking_enabled, paused } = req.body;
  const driver = await getCurrentDriver(req);
  const session = ensureDriverSession(driver.id, { driverName: driver.name });

  if (typeof tracking_enabled === 'boolean') {
    session.trackingOn = tracking_enabled;
  }
  if (typeof paused === 'boolean') {
    session.paused = paused;
  }
  if (!session.shiftActive) {
    session.trackingOn = false;
    session.paused = false;
  }
  session.updatedAt = new Date().toISOString();

  res.json({ success: true, live: serializeLive(session) });
});

const updateLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) {
    res.status(400);
    throw new Error('lat and lng are required');
  }

  const driver = await getCurrentDriver(req);
  const session = ensureDriverSession(driver.id, { driverName: driver.name });

  if (!session.shiftActive || !session.trackingOn || session.paused) {
    return res.json({ success: true, live: serializeLive(session) });
  }

  session.lat = Number(lat);
  session.lng = Number(lng);
  session.updatedAt = new Date().toISOString();

  res.json({ success: true, live: serializeLive(session) });
});

const getAdminShuttleDrivers = asyncHandler(async (_req, res) => {
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, role: true, special: true, phone: true },
  });
  const drivers = allUsers.filter((u) => ['driver', 'staff'].includes(normalizeRole(u.role)));
  const rows = drivers.map((d) => {
    const s = ensureDriverSession(d.id, { driverName: d.name });
    return {
      id: d.id,
      name: d.name,
      role: d.role,
      shuttle_id: d.special || null,
      phone: d.phone || null,
      shift_active: s.shiftActive,
      tracking: s.trackingOn,
      paused: s.paused,
      status: getStatus(s),
      lat: s.lat,
      lng: s.lng,
      updated_at: s.updatedAt,
    };
  });
  res.json({ success: true, drivers: rows });
});

const getEtaPreview = asyncHandler(async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ success: false, message: 'ETA service is not configured' });
  }

  const originLat = Number(req.query.origin_lat);
  const originLng = Number(req.query.origin_lng);
  const destLat = Number(req.query.dest_lat);
  const destLng = Number(req.query.dest_lng);
  const destinationText = String(req.query.destination || '').trim();

  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
    return res.status(400).json({ success: false, message: 'origin_lat and origin_lng are required' });
  }

  const origin = `${originLat},${originLng}`;
  let destination = '';
  if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
    destination = `${destLat},${destLng}`;
  } else if (destinationText) {
    destination = destinationText;
  } else {
    return res.status(400).json({ success: false, message: 'destination or dest_lat/dest_lng is required' });
  }

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric` +
    `&origins=${encodeURIComponent(origin)}` +
    `&destinations=${encodeURIComponent(destination)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  try {
    const raw = await fetch(url);
    const data = await raw.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status !== 'OK') {
      return res.status(200).json({ success: false, message: 'ETA unavailable', element_status: element?.status || null });
    }
    return res.json({
      success: true,
      eta: {
        distance_text: element.distance?.text || null,
        distance_meters: Number(element.distance?.value),
        duration_text: element.duration?.text || null,
        duration_seconds: Number(element.duration?.value),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'ETA lookup failed', error: error?.message || 'unknown' });
  }
});

module.exports = {
  getShuttleLive,
  updateShift,
  updateTracking,
  updateLocation,
  getAdminShuttleDrivers,
  getEtaPreview,
};
