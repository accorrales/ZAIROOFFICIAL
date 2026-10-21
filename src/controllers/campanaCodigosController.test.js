// PGlite escribe TIMESTAMP en UTC pero lo lee en la zona local; el servidor
// (Railway) corre en UTC, así que las pruebas también.
process.env.TZ = 'UTC';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

// PostgreSQL real en memoria con el esquema de códigos + la migración del Reto 70.
async function preparar() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE eventos (id_evento integer PRIMARY KEY);
    CREATE TABLE codigos_descuento (
      id_codigo       SERIAL PRIMARY KEY,
      codigo          VARCHAR(50)  NOT NULL UNIQUE,
      descripcion     TEXT,
      tipo_descuento  VARCHAR(20)  NOT NULL DEFAULT 'PORCENTAJE',
      valor           NUMERIC(12,2) NOT NULL,
      id_evento       INTEGER REFERENCES eventos(id_evento),
      fecha_inicio    TIMESTAMP,
      fecha_fin       TIMESTAMP,
      usos_maximos    INTEGER,
      usos_actuales   INTEGER      NOT NULL DEFAULT 0,
      estado          BOOLEAN      NOT NULL DEFAULT true,
      fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW()
    );
    CREATE TABLE compras_entradas (
      id_compra integer PRIMARY KEY,
      id_evento integer,
      id_codigo integer,
      estado text,
      total numeric(12,2),
      cantidad integer
    );
    CREATE TABLE compra_entrada_detalles (
      id_detalle integer PRIMARY KEY,
      id_compra integer,
      fecha_invalidacion timestamp NULL
    );
    INSERT INTO eventos VALUES (1);
    INSERT INTO codigos_descuento (codigo, descripcion, valor) VALUES ('BRANDFAN', 'Brand fan', 15);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'sql', 'campana_codigos_clientes.sql'), 'utf8'));
  // La migración debe poder correr dos veces (se ejecuta en cada arranque).
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'sql', 'campana_codigos_clientes.sql'), 'utf8'));

  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'campanaCodigosController.js'), 'utf8'),
    {
      module,
      exports: module.exports,
      console: { ...console, error: () => {} },
      Date,
      require: (nombre) => {
        if (nombre === '../config/database') return db;
        throw new Error('Dependencia inesperada ' + nombre);
      }
    },
    { filename: 'campanaCodigosController.js' }
  );
  return { db, controller: module.exports };
}

function respuesta() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function registrar(controller, body) {
  const res = respuesta();
  await controller.registrarCodigo({ body }, res);
  return res;
}

async function progreso(controller, codigo) {
  const res = respuesta();
  await controller.consultarProgreso({ params: { codigo } }, res);
  return res;
}

const persona = {
  nombre: 'Ana María Rojas',
  email: 'ana@example.com',
  telefono: '+506 8888-1234',
  instagram: 'https://www.instagram.com/ana.rojas/',
  codigo: 'ana cr'
};

test('la campaña usa las fechas en hora de Costa Rica', async () => {
  const { db, controller } = await preparar();
  try {
    assert.equal(controller.CAMPANA.fecha_inicio.toISOString(), '2026-10-21T14:00:00.000Z');
    assert.equal(controller.CAMPANA.fecha_fin.toISOString(), '2026-10-29T05:59:59.000Z');
    assert.equal(controller.CAMPANA.porcentaje, 10);
    assert.equal(controller.CAMPANA.meta_entradas, 70);
  } finally {
    await db.close();
  }
});

test('registra un código del cliente con las reglas fijas de la campaña', async () => {
  const { db, controller } = await preparar();
  try {
    const res = await registrar(controller, persona);
    assert.equal(res.code, 201);
    assert.equal(res.body.codigo, 'ANACR');
    assert.equal(res.body.porcentaje, 10);

    const { rows } = await db.query(`SELECT * FROM codigos_descuento WHERE codigo = 'ANACR'`);
    const fila = rows[0];
    assert.equal(fila.tipo_descuento, 'PORCENTAJE');
    assert.equal(Number(fila.valor), 10);
    assert.equal(fila.id_evento, null);
    assert.equal(fila.usos_maximos, null);
    // Nace desactivado: un admin decide si lo aprueba.
    assert.equal(fila.estado, false);
    assert.equal(res.body.pendiente, true);
    assert.equal(fila.contacto_instagram, 'ana.rojas');
    assert.equal(fila.origen, 'CLIENTE');
    assert.equal(fila.campana, controller.CAMPANA.id);
    assert.equal(fila.descripcion, 'Ana María Rojas');
    assert.equal(fila.contacto_email, 'ana@example.com');
    assert.equal(fila.contacto_telefono, '88881234');
    assert.ok(fila.fecha_inicio);
    assert.ok(fila.fecha_fin);
  } finally {
    await db.close();
  }
});

test('rechaza códigos repetidos, reservados o mal formados y datos duplicados', async () => {
  const { db, controller } = await preparar();
  try {
    assert.equal((await registrar(controller, persona)).code, 201);

    const repetido = await registrar(controller, { ...persona, email: 'otro@example.com', telefono: '70001111' });
    assert.equal(repetido.code, 409);
    assert.match(repetido.body.error, /código ya está en uso/);

    const existenteAdmin = await registrar(controller, { ...persona, codigo: 'brandfan', email: 'b@example.com', telefono: '70002222' });
    assert.equal(existenteAdmin.code, 409);

    const mismoCorreo = await registrar(controller, { ...persona, codigo: 'OTRO123', email: 'ANA@example.com', telefono: '70003333' });
    assert.equal(mismoCorreo.code, 409);
    assert.match(mismoCorreo.body.error, /correo/);

    const mismoTelefono = await registrar(controller, { ...persona, codigo: 'OTRO124', email: 'c@example.com', telefono: '8888 1234' });
    assert.equal(mismoTelefono.code, 409);
    assert.match(mismoTelefono.body.error, /teléfono/);

    assert.equal((await registrar(controller, { ...persona, codigo: 'MIZAIRO', email: 'd@example.com', telefono: '70004444' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, codigo: 'ÑAÑA', email: 'e@example.com', telefono: '70005555' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, codigo: 'AB', email: 'f@example.com', telefono: '70006666' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, email: 'no-es-correo', codigo: 'VALIDO1' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, telefono: '123', codigo: 'VALIDO2' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, nombre: ' ', codigo: 'VALIDO3' })).code, 400);
    assert.equal((await registrar(controller, { ...persona, instagram: '', codigo: 'VALIDO4', email: 'g@example.com', telefono: '70007777' })).code, 400);
  } finally {
    await db.close();
  }
});

test('el avance cuenta solo entradas pagadas y no invalidadas', async () => {
  const { db, controller } = await preparar();
  try {
    await registrar(controller, persona);
    const { rows } = await db.query(`SELECT id_codigo FROM codigos_descuento WHERE codigo = 'ANACR'`);
    const id = rows[0].id_codigo;
    await db.exec(`
      INSERT INTO compras_entradas VALUES
        (1, 1, ${id}, 'PAGADA', 9000, 2),
        (2, 1, ${id}, 'PENDIENTE', 4500, 1),
        (3, 1, ${id}, 'PAGADA', 4500, 1);
      INSERT INTO compra_entrada_detalles VALUES
        (1, 1, NULL), (2, 1, NULL), (3, 2, NULL), (4, 3, NOW());
    `);

    const res = await progreso(controller, 'anacr');
    assert.equal(res.code, 200);
    assert.equal(res.body.codigo, 'ANACR');
    assert.equal(res.body.nombre, 'Ana');
    assert.equal(res.body.entradas_vendidas, 2);
    assert.equal(res.body.faltan, 68);
    assert.equal(res.body.meta_alcanzada, false);
    assert.equal(res.body.contacto_email, undefined);

    // Los códigos que no son de la campaña no se exponen.
    assert.equal((await progreso(controller, 'BRANDFAN')).code, 404);
    assert.equal((await progreso(controller, 'NOEXISTE')).code, 404);
  } finally {
    await db.close();
  }
});

test('normaliza teléfonos de Costa Rica con o sin prefijo', async () => {
  const { db, controller } = await preparar();
  try {
    assert.equal(controller.normalizarTelefono('+506 8888-1234'), '88881234');
    assert.equal(controller.normalizarTelefono('8888 1234'), '88881234');
    assert.equal(controller.normalizarTelefono('50688881234'), '88881234');
  } finally {
    await db.close();
  }
});

// Carga el controlador de códigos (el que usa el checkout) con un "ahora" fijo.
function cargarValidador(db, ahoraIso) {
  const ahora = new Date(ahoraIso).getTime();
  class FechaFija extends Date {
    constructor(...args) { super(...(args.length ? args : [ahora])); }
    static now() { return ahora; }
  }
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'codigosDescuentoController.js'), 'utf8'),
    {
      module,
      exports: module.exports,
      console,
      Date: FechaFija,
      require: (nombre) => {
        if (nombre === '../config/database') return db;
        throw new Error('Dependencia inesperada ' + nombre);
      }
    },
    { filename: 'codigosDescuentoController.js' }
  );
  return module.exports;
}

test('el código pendiente no sirve; aprobado aplica 10% solo dentro de la vigencia', async () => {
  const { db, controller } = await preparar();
  try {
    await registrar(controller, persona);

    const pendiente = await cargarValidador(db, '2026-10-22T12:00:00-06:00').evaluarCodigo('anacr', 1, 10000);
    assert.equal(pendiente.ok, false);
    assert.match(pendiente.error, /desactivado/);

    // El admin lo aprueba con el botón Activar del panel (estado = true).
    await db.query(`UPDATE codigos_descuento SET estado = true WHERE codigo = 'ANACR'`);

    const antes = await cargarValidador(db, '2026-10-21T07:59:00-06:00').evaluarCodigo('anacr', 1, 10000);
    assert.equal(antes.ok, false);
    assert.match(antes.error, /todavía no está disponible/);

    const durante = await cargarValidador(db, '2026-10-21T08:00:30-06:00').evaluarCodigo('anacr', 1, 10000);
    assert.equal(durante.ok, true);
    assert.equal(durante.descuento, 1000);
    assert.equal(durante.total, 9000);

    const ultimoMinuto = await cargarValidador(db, '2026-10-28T23:59:30-06:00').evaluarCodigo('ANACR', 1, 4500);
    assert.equal(ultimoMinuto.ok, true);
    assert.equal(ultimoMinuto.descuento, 450);

    const despues = await cargarValidador(db, '2026-10-29T00:00:30-06:00').evaluarCodigo('ANACR', 1, 10000);
    assert.equal(despues.ok, false);
    assert.match(despues.error, /expiró/);
  } finally {
    await db.close();
  }
});
