const crypto = require('crypto');

// La URL privada de la activación usa un token largo. En producción se puede
// reemplazar el hash desde Railway sin cambiar código.
const CORTESIA_TOKEN_SHA256 =
  process.env.CORTESIA_ACTIVACION_TOKEN_SHA256 ||
  '72bbe431e3274af98d4e7fd1eaf3ce90e1f4399357cccbd5b29a157f27225d3b';

const CORTESIA_EVENTO_ID = Number(
  process.env.CORTESIA_ACTIVACION_EVENTO_ID || 5
);

const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo || ''), 'utf8').digest();

const hashEsperado = () => Buffer.from(CORTESIA_TOKEN_SHA256, 'hex');

const esCodigoValido = (idEvento, codigo) => {
  const evento = Number(idEvento);

  if (
    !Number.isInteger(evento) ||
    evento !== CORTESIA_EVENTO_ID ||
    typeof codigo !== 'string' ||
    codigo.trim().length < 20
  ) {
    return false;
  }

  try {
    const recibido = hashCodigo(codigo.trim());
    const esperado = hashEsperado();

    return (
      recibido.length === esperado.length &&
      crypto.timingSafeEqual(recibido, esperado)
    );
  } catch (error) {
    console.error('Error validando código privado de cortesía:', error.message);
    return false;
  }
};

exports.validarCodigo = (req, res) => {
  const { id_evento, codigo_cortesia } = req.body || {};

  if (!esCodigoValido(id_evento, codigo_cortesia)) {
    return res.status(403).json({
      valido: false,
      message: 'El acceso privado de cortesía no es válido.'
    });
  }

  return res.json({ valido: true });
};

exports.protegerCortesia = (req, res, next) => {
  const { bebida_cortesia, id_evento, codigo_cortesia } = req.body || {};

  // Las compras públicas normales siguen funcionando sin cortesía.
  if (
    bebida_cortesia === undefined ||
    bebida_cortesia === null ||
    String(bebida_cortesia).trim() === ''
  ) {
    return next();
  }

  if (!esCodigoValido(id_evento, codigo_cortesia)) {
    return res.status(403).json({
      message: 'Esta cortesía solo está disponible mediante la activación privada.'
    });
  }

  // El token solo se usa para validar la solicitud; no se guarda en la base.
  delete req.body.codigo_cortesia;
  return next();
};

exports.esCodigoValido = esCodigoValido;
