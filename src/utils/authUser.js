const jwt = require('jsonwebtoken');

function getAuthUser(req) {
  const auth = req.headers?.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret123');
  } catch (_) {
    return null;
  }
}

module.exports = { getAuthUser };
