const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

// PostgreSQL real en memoria, sin tocar la base de producción.
async function preparar() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE eventos (id_evento integer PRIMARY KEY);
    CREATE TABLE codigos_descuento (
      id_codigo integer PRIMARY KEY,
      codigo varchar(50),
      descripcion text,
      id_evento integer
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
    INSERT INTO eventos VALUES (1), (2);
    INSERT INTO codigos_descuento VALUES
      (10, 'GLOBAL', 'Brand global', NULL),
      (20, 'INFAMOUS', 'Brand evento 1', 1),
      (30, 'OTRO', 'Brand evento 2', 2);
    INSERT INTO compras_entradas VALUES
      (1, 1, 10, 'PAGADA', 10000, 2),
      (2, 1, 20, 'PAGADA', 9000, 2),
      (3, 2, 10, 'PAGADA', 9000, 3),
      (4, 1, 20, 'PENDIENTE', 9000, 2),
      (5, 1, 30, 'RECHAZADA', 3000, 1),
      (6, 1, 10, 'PAGADA', 3000, 1);
    INSERT INTO compra_entrada_detalles VALUES
      (1, 1, NULL),
      (2, 1, NULL),
      (3, 2, NULL),
      (4, 2, NOW()),
      (5, 3, NULL),
      (6, 3, NULL),
      (7, 3, NULL),
      (8, 4, NULL),
      (9, 4, NULL),
      (10, 5, NULL),
      (11, 6, NOW());
  `);

  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'codigosDescuentoController.js'), 'utf8'),
    {
      module,
      exports: module.exports,
      console,
      require: (nombre) => {
        if (nombre === '../config/database') return db;
        throw new Error('Dependencia inesperada ' + nombre);
      }
    },
    { filename: 'codigosDescuentoController.js' }
  );
  return { db, controller: module.exports };
}

async function consultar(controller, idEvento) {
  const res = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await controller.obtenerRankingPorEvento({ params: { idEvento: String(idEvento) } }, res);
  return res;
}

test('el ranking separa eventos y cuenta códigos globales solo en el evento vendido', async () => {
  const { db, controller } = await preparar();
  try {
    const uno = await consultar(controller, 1);
    assert.equal(uno.code, 200);
    assert.deepEqual(Array.from(uno.body, (c) => c.codigo), ['GLOBAL', 'INFAMOUS']);
    assert.equal(uno.body[0].entradas_vendidas, 2);
    assert.equal(uno.body[0].total_vendido, 10000);
    assert.equal(uno.body[1].entradas_vendidas, 1);
    assert.equal(uno.body[1].total_vendido, 4500);

    const dos = await consultar(controller, 2);
    assert.equal(dos.code, 200);
    assert.deepEqual(Array.from(dos.body, (c) => c.codigo), ['GLOBAL']);
    assert.equal(dos.body[0].entradas_vendidas, 3);
    assert.equal(dos.body[0].total_vendido, 9000);
  } finally {
    await db.close();
  }
});

test('IDs inválidos y eventos inexistentes tienen errores explícitos', async () => {
  const { db, controller } = await preparar();
  try {
    assert.equal((await consultar(controller, 'x')).code, 400);
    assert.equal((await consultar(controller, 0)).code, 400);
    assert.equal((await consultar(controller, -1)).code, 400);
    assert.equal((await consultar(controller, 99)).code, 404);
  } finally {
    await db.close();
  }
});

test('evento sin compras con códigos devuelve lista vacía', async () => {
  const { db, controller } = await preparar();
  try {
    await db.query('INSERT INTO eventos VALUES (3)');
    const res = await consultar(controller, 3);
    assert.equal(res.code, 200);
    assert.equal(res.body.length, 0);
  } finally {
    await db.close();
  }
});
