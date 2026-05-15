const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const asyncHandler = require('express-async-handler');

const protect = asyncHandler(async (req, res, next) => {
  // 1. Check for Internal Proxy Key (Server-to-Server)
  const internalKey = req.headers['x-shuttle-proxy-key'];
  if (internalKey && internalKey === (process.env.SHUTTLE_INTERNAL_KEY || 'shuttle_secret_123')) {
    return next();
  }

  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, status: true, role: true }
      });

      if (!user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }

      if (user.status === 'INACTIVE') {
        res.status(401);
        throw new Error('Account Disabled: Your access has been revoked by the admin.');
      }

      req.user = user;
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error(error.message || 'Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

module.exports = { protect };
