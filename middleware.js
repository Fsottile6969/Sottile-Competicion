const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Sesión expirada, iniciá sesión nuevamente' : 'Token inválido';
    res.status(401).json({ error: msg });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.rol !== 'admin') {
    console.warn(`[ACCESO DENEGADO] usuario_id=${req.user?.id} intentó acceder a ruta admin: ${req.originalUrl}`);
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
