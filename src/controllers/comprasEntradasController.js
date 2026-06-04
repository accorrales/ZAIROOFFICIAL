const pool = require('../config/database');

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

    const result = await pool.query(
      `
      UPDATE compras_entradas
      SET estado = 'PAGADA'
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

    await pool.query(
      `
      UPDATE compra_entrada_detalles
      SET estado = 'CONFIRMADA'
      WHERE id_compra = $1
      `,
      [id]
    );

    res.json({
      message: 'Compra confirmada correctamente',
      compra: result.rows[0]
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