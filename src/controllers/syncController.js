const axios = require('axios');
const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Sync Tenants from Masteko PMS
 * @route   GET /api/sync/pms
 * @access  Admin
 */
const syncPMS = asyncHandler(async (req, res) => {
  try {
    const { pmsId, apiKey } = req.body;

    if (!pmsId || !apiKey) {
      return res.status(400).json({ success: false, message: 'Please provide both PMS ID and API Key.' });
    }

    const MASTEKO_URL = 'https://saif-property-client-railway-production.up.railway.app';
    const LOGIN_PAYLOAD = {
      email: pmsId,
      password: apiKey
    };

    console.log('🔄 Logging into Masteko...');
    const loginRes = await axios.post(`${MASTEKO_URL}/api/auth/login`, LOGIN_PAYLOAD);
    const token = loginRes.data.accessToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Could not authenticate with Masteko.' });
    }

    console.log('✅ Token received. Fetching ALL tenants (limit=1000)...');
    const tenantsRes = await axios.get(`${MASTEKO_URL}/api/admin/tenants?limit=1000&perPage=1000&per_page=1000`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const mastekoData = tenantsRes.data.data; // Array of people
    console.log(`📦 Found ${mastekoData.length} entries in Masteko.`);

    let syncedCount = 0;

    for (const person of mastekoData) {
      // --- FIXED: Only sync Individuals and Residents (skip Companies, etc.) ---
      if (person.type !== 'INDIVIDUAL' && person.type !== 'RESIDENT') {
        process.stdout.write(`⏭️ Skipping ${person.type}: ${person.name}\n`);
        continue;
      }
      // -------------------------------------------------------------------------

      const personId = person.id || person._id || person.uid || Math.random().toString(36).substr(2, 9);
      const email = person.email || `pms-${personId}@morgan.com`; // Unique fallback
      const role = 'tenant'; // Everyone becomes a tenant in our system
      
      // UPSERT user to avoid duplicates
      await prisma.user.upsert({
        where: { email },
        update: {
          name: person.name || 'Unknown',
          source: 'PMS',
          extra: person.type === 'RESIDENT' ? `Occupant (Parent: ${person.parentId})` : 'Tenant'
        },
        create: {
          email,
          name: person.name || 'Unknown',
          role,
          source: 'PMS',
          password_set: false, // They must set it later
          extra: person.type === 'RESIDENT' ? `Occupant (Parent: ${person.parentId})` : 'Tenant'
        }
      });
      syncedCount++;
    }

    res.json({ 
      success: true, 
      message: `${syncedCount} users synced successfully from Masteko.`,
      count: syncedCount 
    });

  } catch (error) {
    console.error('❌ Sync Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Masteko Sync failed', 
      error: error.response?.data || error.message 
    });
  }
});

module.exports = { syncPMS };
