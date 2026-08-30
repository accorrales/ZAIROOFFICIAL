const pool = require('../config/database');
const QRCode = require('qrcode');

const emailService = require('../services/emailService');
const walletService = require('../services/walletService');
const confirmarCompraService = require('../services/confirmarCompraService');
const { evaluarCodigo } = require('./codigosDescuentoController');

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BEBIDAS_CORTESIA = new Set(['PUNCH_CLUB', 'SOLEO']);

const normalizarBebidaCortesia = (valor) => {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return null;
  }

  const normalizada = String(valor)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return BEBIDAS_CORTESIA.has(normalizada) ? normalizada : null;
};

const obtenerEntradaPorUuid = async (uuid) => {
  if (!uuid || !uuidRegex.test(uuid)) return null;

  const result = await pool.query(
    `
    SELECT
      d.id_detalle,
      d.id_compra,
      d.nombre_completo,
      d.fecha_nacimiento,
      d.estado,
      d.uuid_entrada,
      d.qr_data,
      d.fecha_ingreso,
      d.bebida_cortesia,
      d.cortesia_tiquete_entregado,
      d.cortesia_tiquete_entregado_en,
      c.correo_comprador,
      c.telefono_comprador,
      c.total,
      c.estado AS estado_compra,
      e.id_evento,
      e.nombre AS evento,
      e.fecha AS fecha_evento,
      e.ubicacion AS ubicacion_evento,
      e.imagen AS imagen_evento,
      t.nombre AS entrada,
      t.precio
    FROM compra_entrada_detalles d
    INNER JOIN compras_entradas c ON c.id_compra = d.id_compra
    INNER JOIN eventos e ON e.id_evento = c.id_evento
    INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
    WHERE d.uuid_entrada = $1
    `,
    [uuid]
  );

  return result.rows[0] || null;
};

exports.crearCompra = async (req, res) => {
  try {
    const {
      id_evento,
      id_tier,
      correo_comprador,
      telefono_comprador,
      personas,
      codigo_descuento,
      bebida_cortesia
    } = req.body;

    if (!id_evento || !id_tier) {
      return res.status(400).json({ message: 'Debe seleccionar evento y tipo de entrada' });
    }

    if (!correo_comprador || !correo_comprador.trim()) {
      return res.status(400).json({ message: 'Debe ingresar un correo electrónico' });
    }

    if (!telefono_comprador || !telefono_comprador.trim()) {
      return res.status(400).json({ message: 'Debe ingresar un número de teléfono' });
    }

    if (!personas || personas.length === 0) {
      return res.status(400).json({ message: 'Debe agregar al menos una persona' });
    }

    const bebidaCortesia = normalizarBebidaCortesia(bebida_cortesia);
    const seEnvioBebida =
      bebida_cortesia !== undefined &&
      bebida_cortesia !== null &&
      String(bebida_cortesia).trim() !== '';

    if (seEnvioBebida && !bebidaCortesia) {
      return res.status(400).json({
        message: 'La bebida de cortesía debe ser PUNCH_CLUB o SOLEO'
      });
    }

    const eventoResult = await pool.query(
      `SELECT * FROM eventos WHERE id_evento = $1`,
      [id_evento]
    );

    if (eventoResult.rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const evento = eventoResult.rows[0];

    if (evento.estado !== true) {
      return res.status(403).json({
        message: 'Las entradas para este evento todavía no están disponibles'
      });
    }

    const fechaEvento = new Date(evento.fecha);

    for (const persona of personas) {
      if (!persona.nombre_completo || !persona.nombre_completo.trim()) {
        return res.status(400).json({ message: 'Cada persona debe ingresar su nombre completo' });
      }

      if (!persona.fecha_nacimiento) {
        return res.status(400).json({ message: 'Cada persona debe ingresar su fecha de nacimiento' });
      }

      const fechaNacimiento = new Date(persona.fecha_nacimiento);

      if (isNaN(fechaNacimiento.getTime())) {
        return res.status(400).json({
          message: `La fecha de nacimiento de ${persona.nombre_completo} no es válida`
        });
      }

      const fechaCumple17 = new Date(fechaNacimiento);
      fechaCumple17.setFullYear(fechaCumple17.getFullYear() + 17);
      fechaCumple17.setHours(0, 0, 0, 0);

      const fechaEventoComparacion = new Date(fechaEvento);
      fechaEventoComparacion.setHours(0, 0, 0, 0);

      if (fechaCumple17 > fechaEventoComparacion) {
        return res.status(400).json({
          message: `${persona.nombre_completo} debe tener 17 años cumplidos para la fecha del evento`
        });
      }
    }

    const tierResult = await pool.query(
      `SELECT * FROM entrada_tiers WHERE id_tier = $1 AND id_evento = $2`,
      [id_tier, id_evento]
    );

    if (tierResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tipo de entrada no encontrado para este evento' });
    }

    const tier = tierResult.rows[0];
    const cantidad = personas.length;
    const subtotal = Number(tier.precio) * cantidad;

    // Aplicar código de descuento si el comprador ingresó uno.
    let descuento = 0;
    let idCodigo = null;

    if (codigo_descuento && codigo_descuento.toString().trim()) {
      const evaluacion = await evaluarCodigo(codigo_descuento, id_evento, subtotal);

      if (!evaluacion.ok) {
        return res.status(400).json({ message: evaluacion.error });
      }

      descuento = evaluacion.descuento;
      idCodigo = evaluacion.codigo.id_codigo;
    }

    const total = Math.round((subtotal - descuento) * 100) / 100;

    const compraResult = await pool.query(
      `
      INSERT INTO compras_entradas
      (
        id_evento,
        id_tier,
        correo_comprador,
        telefono_comprador,
        cantidad,
        subtotal,
        descuento,
        total,
        id_codigo,
        bebida_cortesia
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        id_evento,
        id_tier,
        correo_comprador.trim(),
        telefono_comprador.trim(),
        cantidad,
        subtotal,
        descuento,
        total,
        idCodigo,
        bebidaCortesia
      ]
    );

    const compra = compraResult.rows[0];

    // No se suma el uso del código aquí porque la compra todavía está pendiente.
    // Las métricas de códigos se calculan desde entradas pagadas y no invalidadas.
    for (const persona of personas) {
      await pool.query(
        `
        INSERT INTO compra_entrada_detalles
        (id_compra, nombre_completo, fecha_nacimiento, bebida_cortesia)
        VALUES ($1,$2,$3,$4)
        `,
        [
          compra.id_compra,
          persona.nombre_completo.trim(),
          persona.fecha_nacimiento,
          bebidaCortesia
        ]
      );
    }

    res.status(201).json({
      message: 'Compra creada correctamente',
      compra
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creando compra' });
  }
};

exports.listarPendientes = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id_compra,
        c.id_evento,
        e.nombre AS evento,
        t.nombre AS entrada,
        c.correo_comprador,
        c.telefono_comprador,
        c.cantidad,
        c.total,
        c.bebida_cortesia,
        c.estado,
        c.fecha_creacion
      FROM compras_entradas c
      INNER JOIN eventos e ON e.id_evento = c.id_evento
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE c.estado = 'PENDIENTE'
      ORDER BY c.fecha_creacion DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo compras pendientes' });
  }
};

exports.obtenerCompraPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const compraResult = await pool.query(`
      SELECT
        c.*,
        e.nombre AS evento,
        t.nombre AS entrada
      FROM compras_entradas c
      INNER JOIN eventos e ON e.id_evento = c.id_evento
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE c.id_compra = $1
    `, [id]);

    if (compraResult.rows.length === 0) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    const personasResult = await pool.query(`
      SELECT
        id_detalle,
        nombre_completo,
        fecha_nacimiento,
        estado,
        uuid_entrada,
        qr_data,
        bebida_cortesia,
        cortesia_tiquete_entregado,
        cortesia_tiquete_entregado_en
      FROM compra_entrada_detalles
      WHERE id_compra = $1
      ORDER BY id_detalle
    `, [id]);

    res.json({
      compra: compraResult.rows[0],
      personas: personasResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo compra' });
  }
};

exports.confirmarCompra = async (req, res) => {
  try {
    const { id } = req.params;

    // Fuente única de verdad: genera QR, envía el correo con las entradas
    // y marca la compra como PAGADA. Reutilizado también por el módulo de
    // WhatsApp para no duplicar lógica.
    const resultado = await confirmarCompraService.confirmarCompra(id, {
      source: 'PANEL',
      createdBy: req.user?.correo || req.user?.usuario || String(req.user?.id || 'admin')
    });

    return res.json({
      message: 'Compra confirmada correctamente',
      compra: resultado.compra
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: error.message });
    }
    if (error.statusCode === 409) {
      // Se mantiene 400 para no romper el manejo actual del frontend.
      return res.status(400).json({ message: error.message });
    }
    console.error('ERROR CONFIRMANDO COMPRA:', error);
    return res.status(500).json({ message: error.message || 'Error confirmando compra' });
  }
};

exports.testEmail = async (req, res) => {
  try {
    await emailService.enviarEntradas({
      correo: 'indiscretoinfo@gmail.com',
      evento: 'Prueba ZAIRO',
      entrada: 'Test Ticket',
      personas: [
        {
          nombre_completo: 'Prueba QR',
          qr_url: `${process.env.BACKEND_PUBLIC_URL}/api/health`,
          ticket_url: `${process.env.FRONTEND_PUBLIC_URL}/t/test`,
          apple_wallet_url: `${process.env.BACKEND_PUBLIC_URL}/api/compras-entradas/wallet/apple/test`,
          google_wallet_url: null
        }
      ]
    });

    res.json({ message: 'Correo de prueba enviado' });
  } catch (error) {
    console.error('ERROR TEST EMAIL:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.rechazarCompra = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE compras_entradas
      SET estado = 'RECHAZADA'
      WHERE id_compra = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    res.json({
      message: 'Compra rechazada correctamente',
      compra: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error rechazando compra' });
  }
};

exports.validarQr = async (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({
        valido: false,
        message: 'QR requerido'
      });
    }

    let uuidEntrada = null;

    try {
      const data = JSON.parse(qr_data);
      if (data.tipo === 'ZAIRO_TICKET' && data.uuid) {
        uuidEntrada = data.uuid;
      }
    } catch {
      const match = qr_data.match(/\/t\/([a-f0-9-]+)/i);
      if (match && match[1]) uuidEntrada = match[1];
    }

    if (!uuidEntrada || !uuidRegex.test(uuidEntrada)) {
      return res.status(400).json({
        valido: false,
        message: 'QR inválido'
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE compra_entrada_detalles d
      SET
        estado = 'USADA',
        fecha_ingreso = NOW(),
        cortesia_tiquete_entregado = CASE
          WHEN d.bebida_cortesia IS NOT NULL THEN TRUE
          ELSE FALSE
        END,
        cortesia_tiquete_entregado_en = CASE
          WHEN d.bebida_cortesia IS NOT NULL THEN NOW()
          ELSE NULL
        END
      FROM compras_entradas c
      INNER JOIN eventos e ON e.id_evento = c.id_evento
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE d.id_compra = c.id_compra
        AND d.uuid_entrada = $1
        AND d.estado = 'CONFIRMADA'
      RETURNING
        d.id_detalle,
        d.nombre_completo,
        d.estado,
        d.uuid_entrada,
        d.fecha_ingreso,
        d.bebida_cortesia,
        d.cortesia_tiquete_entregado,
        d.cortesia_tiquete_entregado_en,
        c.id_compra,
        e.nombre AS evento,
        e.fecha AS fecha_evento,
        t.nombre AS entrada
      `,
      [uuidEntrada]
    );

    if (updateResult.rows.length > 0) {
      const entrada = updateResult.rows[0];

      return res.json({
        valido: true,
        message: entrada.bebida_cortesia
          ? 'Entrada válida. Acceso permitido y tiquete de cortesía registrado.'
          : 'Entrada válida. Acceso permitido.',
        entrada,
        cortesia: entrada.bebida_cortesia
          ? {
              bebida: entrada.bebida_cortesia,
              entregar_tiquete: true,
              tiquete_entregado: entrada.cortesia_tiquete_entregado
            }
          : null
      });
    }

    const entrada = await obtenerEntradaPorUuid(uuidEntrada);

    if (!entrada) {
      return res.status(404).json({
        valido: false,
        message: 'Entrada no encontrada'
      });
    }

    if (entrada.estado === 'INVALIDADA') {
      return res.status(400).json({
        valido: false,
        message: 'Esta entrada fue invalidada. Acceso denegado.',
        entrada
      });
    }

    if (entrada.estado === 'USADA') {
      return res.status(400).json({
        valido: false,
        message: 'Esta entrada ya fue utilizada',
        entrada,
        cortesia: entrada.bebida_cortesia
          ? {
              bebida: entrada.bebida_cortesia,
              entregar_tiquete: false,
              tiquete_entregado: entrada.cortesia_tiquete_entregado,
              tiquete_entregado_en: entrada.cortesia_tiquete_entregado_en
            }
          : null
      });
    }

    return res.status(400).json({
      valido: false,
      message: 'Entrada no confirmada',
      entrada
    });
  } catch (error) {
    console.error('ERROR VALIDANDO QR:', error);
    return res.status(500).json({
      valido: false,
      message: 'Error validando QR'
    });
  }
};

exports.obtenerQrEntrada = async (req, res) => {
  try {
    const { uuid } = req.params;
    const entrada = await obtenerEntradaPorUuid(uuid);

    if (!entrada) {
      return res.status(404).json({ message: 'QR no encontrado' });
    }

    const qrBuffer = await QRCode.toBuffer(entrada.qr_data || walletService.getTicketUrl(uuid));

    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (error) {
    console.error('ERROR GENERANDO QR PUBLICO:', error);
    res.status(500).json({ message: 'Error generando QR' });
  }
};

exports.obtenerAppleWallet = async (req, res) => {
  try {
    const { uuid } = req.params;
    const entrada = await obtenerEntradaPorUuid(uuid);

    if (!entrada) {
      return res.status(404).json({ message: 'Entrada no encontrada' });
    }

    if (entrada.estado_compra !== 'PAGADA') {
      return res.status(400).json({ message: 'La entrada todavía no está pagada' });
    }

    const pkpassBuffer = await walletService.generarApplePass(entrada);

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="zairo-${uuid}.pkpass"`);
    return res.send(pkpassBuffer);
  } catch (error) {
    console.error('ERROR APPLE WALLET:', error);
    return res.status(error.statusCode || 500).json({
      message: error.message || 'Error generando Apple Wallet'
    });
  }
};

exports.obtenerGoogleWallet = async (req, res) => {
  try {
    const { uuid } = req.params;
    const entrada = await obtenerEntradaPorUuid(uuid);

    if (!entrada) {
      return res.status(404).json({ message: 'Entrada no encontrada' });
    }

    if (entrada.estado_compra !== 'PAGADA') {
      return res.status(400).json({ message: 'La entrada todavía no está pagada' });
    }

    const googleWalletUrl = await walletService.generarGoogleWalletUrl(entrada);

    if (!googleWalletUrl) {
      return res.status(501).json({
        message: 'Google Wallet todavía no tiene credenciales configuradas'
      });
    }

    return res.redirect(googleWalletUrl);
  } catch (error) {
    console.error('ERROR GOOGLE WALLET:', error);
    return res.status(500).json({ message: 'Error generando Google Wallet' });
  }
};
