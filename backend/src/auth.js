import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'development-secret-change-me';

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, secret, { expiresIn: '7d' });
}

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}

export function role(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action.' });
}
