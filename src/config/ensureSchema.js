const fs = require('fs');
const path = require('path');
const pool = require('./database');

// ============================================================
//  Asegura que el esquema tenga las columnas necesarias para el
//  historial de invalidación de entradas. Se ejecuta al arrancar
//  el servidor, de forma idempotente, para que el deploy no dependa
//  de correr un script SQL a mano (importante en Railway).
//
//  Equivale a src/sql/invalidar_entradas_historial.sql.
// ============================================================

// Ejecuta un archivo SQL idempotente del directorio src/sql. Best effort:
// si falla, lo registra pero no tumba el arranque.
const ejecutarSqlIdempotente = async (nombreArchivo) => {
  try {
    const ruta = path.join(__dirname, '..', 'sql', nombreArchivo);
    const sql = fs.readFileSync(ruta, 'utf8');
    await pool.query(sql);
    console.log(`ensureSchema: ${nombreArchivo} aplicado`);
  } catch (error) {
    console.error(`ensureSchema: fallo aplicando ${nombreArchivo}:`, error.message);
  }
};

const ensureSchema = async () => {
  try {
    await pool.query(`
      ALTER TABLE compra_entrada_detalles
        ADD COLUMN IF NOT EXISTS estado_anterior    VARCHAR(20),
        ADD COLUMN IF NOT EXISTS fecha_invalidacion TIMESTAMPTZ
    `);

    // Normaliza estados nulos/vacíos de entradas ya pagadas para que
    // el panel y la invalidación funcionen con datos antiguos.
    await pool.query(`
      UPDATE compra_entrada_detalles d
      SET estado = 'CONFIRMADA'
      FROM compras_entradas c
      WHERE c.id_compra = d.id_compra
        AND c.estado = 'PAGADA'
        AND (d.estado IS NULL OR d.estado = '')
    `);

    console.log('ensureSchema: esquema de entradas verificado');

    // Módulo WhatsApp: conversaciones, mensajes, comprobantes e historial.
    await ejecutarSqlIdempotente('whatsapp_module.sql');
  } catch (error) {
    // No tumbamos el servidor si esto falla; solo lo registramos.
    console.error('ensureSchema: no se pudo verificar/actualizar el esquema:', error.message);
  }
};

module.exports = { ensureSchema };
