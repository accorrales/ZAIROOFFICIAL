const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const emailService = require('../services/emailService');

exports.crearCompra = async (req, res) => {
  try {
    const {
      id_evento,
      id_tier,
      correo_comprador,
      telefono_comprador,
      personas
    } = req.body;

    if (!id_evento || !id_tier) {
      return res.status(400).json({
        message: 'Debe seleccionar evento y tipo de entrada'
      });
    }

    if (!correo_comprador || !correo_comprador.trim()) {
      return res.status(400).json({
        message: 'Debe ingresar un correo electrónico'
      });
    }

    if (!telefono_comprador || !telefono_comprador.trim()) {
      return res.status(400).json({
        message: 'Debe ingresar un número de teléfono'
      });
    }

    if (!personas || personas.length === 0) {
      return res.status(400).json({
        message: 'Debe agregar al menos una persona'
      });
    }

    const eventoResult = await pool.query(
      `SELECT * FROM eventos WHERE id_evento = $1`,
      [id_evento]
    );

    if (eventoResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Evento no encontrado'
      });
    }

    const evento = eventoResult.rows[0];
    const fechaEvento = new Date(evento.fecha);

    for (const persona of personas) {
      if (!persona.nombre_completo || !persona.nombre_completo.trim()) {
        return res.status(400).json({
          message: 'Cada persona debe ingresar su nombre completo'
        });
      }

      if (!persona.fecha_nacimiento) {
        return res.status(400).json({
          message: 'Cada persona debe ingresar su fecha de nacimiento'
        });
      }

      const fechaNacimiento = new Date(persona.fecha_nacimiento);

      if (isNaN(fechaNacimiento.getTime())) {
        return res.status(400).json({
          message: `La fecha de nacimiento de ${persona.nombre_completo} no es válida`
        });
      }

        const fechaCumple17 = new Date(fechaNacimiento);
        fechaCumple17.setFullYear(fechaCumple17.getFullYear() + 17);

        // quitar horas para comparar solo fechas
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
      return res.status(404).json({
        message: 'Tipo de entrada no encontrado para este evento'
      });
    }

    const tier = tierResult.rows[0];
    const cantidad = personas.length;
    const total = Number(tier.precio) * cantidad;

    const compraResult = await pool.query(
      `
      INSERT INTO compras_entradas
      (
        id_evento,
        id_tier,
        correo_comprador,
        telefono_comprador,
        cantidad,
        total
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        id_evento,
        id_tier,
        correo_comprador.trim(),
        telefono_comprador.trim(),
        cantidad,
        total
      ]
    );

    const compra = compraResult.rows[0];

    for (const persona of personas) {
      await pool.query(
        `
        INSERT INTO compra_entrada_detalles
        (
          id_compra,
          nombre_completo,
          fecha_nacimiento
        )
        VALUES ($1,$2,$3)
        `,
        [
          compra.id_compra,
          persona.nombre_completo.trim(),
          persona.fecha_nacimiento
        ]
      );
    }

    res.status(201).json({
      message: 'Compra creada correctamente',
      compra
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error creando compra'
    });
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
    res.status(500).json({
      message: 'Error obteniendo compras pendientes'
    });
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
      return res.status(404).json({
        message: 'Compra no encontrada'
      });
    }

    const personasResult = await pool.query(`
      SELECT
        id_detalle,
        nombre_completo,
        fecha_nacimiento,
        estado
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

    res.status(500).json({
      message: 'Error obteniendo compra'
    });

  }
};

exports.confirmarCompra = async (req, res) => {
  try {
    const { id } = req.params;

    const compraResult = await pool.query(
      `
      SELECT
        c.*,
        e.nombre AS evento,
        e.fecha AS fecha_evento,
        e.ubicacion AS ubicacion_evento,
        t.nombre AS entrada
      FROM compras_entradas c
      INNER JOIN eventos e ON e.id_evento = c.id_evento
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE c.id_compra = $1
      `,
      [id]
    );

    if (compraResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Compra no encontrada'
      });
    }

    const compra = compraResult.rows[0];

    if (compra.estado === 'PAGADA') {
      return res.status(400).json({
        message: 'Esta compra ya fue confirmada'
      });
    }

    const personasResult = await pool.query(
      `
      SELECT *
      FROM compra_entrada_detalles
      WHERE id_compra = $1
      ORDER BY id_detalle
      `,
      [id]
    );

    for (const persona of personasResult.rows) {

        const uuidEntrada = persona.uuid_entrada || uuidv4();

        const qrData = JSON.stringify({
            tipo: 'ZAIRO_TICKET',
            uuid: uuidEntrada,
            id_compra: compra.id_compra,
            id_detalle: persona.id_detalle,
            nombre: persona.nombre_completo,
            evento: compra.evento
        });

        const nombreArchivo = `${uuidEntrada}.png`;

        const rutaQr = path.join(
            __dirname,
            '..',
            'uploads',
            'qrs',
            nombreArchivo
        );

        try {   

            await QRCode.toFile(rutaQr, qrData);

            console.log('QR generado:', rutaQr);

            } catch (qrError) {

            console.error('Error generando QR:', qrError);

        }

        await pool.query(
            `
            UPDATE compra_entrada_detalles
            SET
            uuid_entrada = $1,
            qr_data = $2,
            estado = 'CONFIRMADA'
            WHERE id_detalle = $3
            `,
            [
            uuidEntrada,
            qrData,
            persona.id_detalle
            ]
        );

        }

    const personasConQr = personasResult.rows.map(p => ({
    nombre_completo: p.nombre_completo,
    ruta_qr: path.join(
        __dirname,
        '..',
        'uploads',
        'qrs',
        `${p.uuid_entrada || ''}.png`
    )
    }));

    await emailService.enviarEntradas({
    correo: compra.correo_comprador,
    evento: compra.evento,
    entrada: compra.entrada,
    personas: personasConQr
    });

    const updateCompra = await pool.query(
      `
      UPDATE compras_entradas
      SET estado = 'PAGADA'
      WHERE id_compra = $1
      RETURNING *
      `,
      [id]
    );

    res.json({
      message: 'Compra confirmada correctamente. QR generados por entrada.',
      compra: updateCompra.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error confirmando compra'
    });
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
      return res.status(404).json({
        message: 'Compra no encontrada'
      });
    }

    res.json({
      message: 'Compra rechazada correctamente',
      compra: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error rechazando compra'
    });
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

    let data;

    try {
      data = JSON.parse(qr_data);
    } catch {
      return res.status(400).json({
        valido: false,
        message: 'QR inválido'
      });
    }

    const result = await pool.query(
      `
      SELECT
        d.id_detalle,
        d.nombre_completo,
        d.estado,
        d.uuid_entrada,
        c.id_compra,
        e.nombre AS evento,
        e.fecha AS fecha_evento,
        t.nombre AS entrada
      FROM compra_entrada_detalles d
      INNER JOIN compras_entradas c ON c.id_compra = d.id_compra
      INNER JOIN eventos e ON e.id_evento = c.id_evento
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE d.uuid_entrada = $1
      `,
      [data.uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        valido: false,
        message: 'Entrada no encontrada'
      });
    }

    const entrada = result.rows[0];

    if (entrada.estado === 'USADA') {
      return res.status(400).json({
        valido: false,
        message: 'Esta entrada ya fue utilizada',
        entrada
      });
    }

    if (entrada.estado !== 'CONFIRMADA') {
      return res.status(400).json({
        valido: false,
        message: 'Entrada no confirmada',
        entrada
      });
    }

    await pool.query(
      `
      UPDATE compra_entrada_detalles
      SET estado = 'USADA'
      WHERE id_detalle = $1
      `,
      [entrada.id_detalle]
    );

    return res.json({
      valido: true,
      message: 'Entrada válida. Acceso permitido.',
      entrada: {
        ...entrada,
        estado: 'USADA'
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      valido: false,
      message: 'Error validando QR'
    });
  }
};