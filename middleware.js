const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Sesión expirada, iniciá sesión nuevamente'
      : 'Token inválido';
    return res.status(401).json({ error: msg });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    console.warn(`[ACCESO DENEGADO] usuario_id=${req.user?.id} url=${req.originalUrl} ip=${req.ip}`);
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
