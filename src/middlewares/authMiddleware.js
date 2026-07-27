const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: 'Token requerido'
    });
  }

  const [scheme, token] = authHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({
      message: 'Formato de autorización inválido'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido'
    });
  }
};

// Requiere que el token ya haya sido verificado. Permite declarar los roles
// autorizados por módulo o por endpoint sin duplicar lógica de seguridad.
const requiereRoles = (...rolesPermitidos) => {
  const rolesNormalizados = rolesPermitidos.map((rol) =>
    String(rol).toLowerCase().trim()
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Autenticación requerida'
      });
    }

    const rolUsuario = String(req.user.rol || '').toLowerCase().trim();

    if (!rolUsuario || !rolesNormalizados.includes(rolUsuario)) {
      return res.status(403).json({
        message: 'No tiene permisos para acceder a este recurso'
      });
    }

    next();
  };
};

const requiereAdmin = requiereRoles('admin');

module.exports = verificarToken;
module.exports.verificarToken = verificarToken;
module.exports.requiereRoles = requiereRoles;
module.exports.requiereAdmin = requiereAdmin;
