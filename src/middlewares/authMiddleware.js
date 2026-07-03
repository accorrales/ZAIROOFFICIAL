const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: 'Token requerido'
        });
    }

    const token = authHeader.split(' ')[1];

    try {

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(403).json({
            message: 'Token inválido'
        });

    }

};

// Requiere que el token ya haya sido verificado (usar después de
// verificarToken). Solo deja pasar a usuarios con rol 'admin'.
const requiereAdmin = (req, res, next) => {

    if (!req.user || String(req.user.rol).toLowerCase() !== 'admin') {
        return res.status(403).json({
            message: 'Acceso restringido a administradores'
        });
    }

    next();

};

module.exports = verificarToken;
module.exports.verificarToken = verificarToken;
module.exports.requiereAdmin = requiereAdmin;