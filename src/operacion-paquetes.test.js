const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { operationalConfig, createPackages } = require('./services/paquetesOperacion');
const { packageQuote } = require('./utils/ticketPackage');
test('operational entitlements are bounded and separate from individual courtesy', () => {
    const body = { entradas_por_paquete: 6, mesa_tipo: 'COCTEL', beneficios_operativos: [{ nombre: 'Bebida', cantidad: 4 }] };
    assert.deepEqual(operationalConfig(body), { benefits: [{ nombre: 'Bebida', cantidad: 4 }], mesa: 'COCTEL' });
    for (const bad of [{ ...body, entradas_por_paquete: 1 }, { ...body, beneficios_operativos: [{ nombre: 'Bebida', cantidad: 0 }] }, { ...body, beneficios_operativos: [{ nombre: 'Bebida', cantidad: 1 }, { nombre: 'bebida', cantidad: 2 }] }])
        assert.throws(() => operationalConfig(bad));
    assert.deepEqual(packageQuote({ entradas_por_paquete: 6, precio: 75000, cantidad_disponible: 2, estado: true }, 12), { units: 2, subtotal: 150000 });
    assert.throws(() => packageQuote({ entradas_por_paquete: 6, precio: 75000, cantidad_disponible: 20, estado: true }, 66));
});
test('repeatable migration leaves ambiguous legacy groups untouched; new packages have immutable independent snapshots', async () => {
    const { PGlite } = require('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(`CREATE TABLE eventos(id_evento SERIAL PRIMARY KEY);CREATE TABLE entrada_tiers(id_tier SERIAL PRIMARY KEY,nombre TEXT);
 CREATE TABLE compras_entradas(id_compra SERIAL PRIMARY KEY,id_evento INT REFERENCES eventos,id_tier INT REFERENCES entrada_tiers,cantidad INT);
 CREATE TABLE compra_entrada_detalles(id_detalle SERIAL PRIMARY KEY,id_compra INT REFERENCES compras_entradas);`);
    await db.exec(fs.readFileSync(require.resolve('./sql/paquetes_promocionales.sql'), 'utf8'));
    await db.exec("INSERT INTO eventos DEFAULT VALUES;INSERT INTO entrada_tiers(nombre) VALUES('VIP');INSERT INTO compras_entradas(id_evento,id_tier,cantidad,unidades_reservadas) VALUES(1,1,12,2),(1,1,1,1);INSERT INTO compra_entrada_detalles(id_compra) SELECT 1 FROM generate_series(1,12);INSERT INTO compra_entrada_detalles(id_compra) VALUES(2);");
    const sql = fs.readFileSync(require.resolve('./sql/operacion_paquetes.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    assert.equal((await db.query('SELECT count(*)::int n FROM compra_paquetes WHERE id_compra=1')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM compra_paquetes WHERE id_compra=2')).rows[0].n, 1);
    const c = (await db.query('INSERT INTO compras_entradas(id_evento,id_tier,cantidad,unidades_reservadas) VALUES(1,1,12,2) RETURNING *')).rows[0];
    await db.query('INSERT INTO compra_entrada_detalles(id_compra) SELECT $1 FROM generate_series(1,12)', [c.id_compra]);
    const tier = { entradas_por_paquete: 6, nombre: 'Promo original', zona: 'VIP', mesa_tipo: 'COCTEL', beneficios_operativos: [{ nombre: 'Bebida', cantidad: 4 }], beneficios_paquete: 'Mesa y bebidas' };
    await createPackages(db, c, tier);
    const p = (await db.query('SELECT * FROM compra_paquetes WHERE id_compra=$1 ORDER BY numero', [c.id_compra])).rows;
    assert.equal(p.length, 2);
    assert.notEqual(p[0].id_paquete, p[1].id_paquete);
    for (const group of p) {
        assert.equal((await db.query('SELECT count(*)::int n FROM compra_entrada_detalles WHERE id_paquete=$1', [group.id_paquete])).rows[0].n, 6);
        assert.equal(group.mesa_tipo, 'COCTEL');
    }
    tier.nombre = 'Editada';
    tier.beneficios_operativos[0].cantidad = 99;
    assert.deepEqual((await db.query('SELECT nombre,cantidad,entregada FROM paquete_beneficios ORDER BY id_beneficio')).rows, [{ nombre: 'Bebida', cantidad: 4, entregada: 0 }, { nombre: 'Bebida', cantidad: 4, entregada: 0 }]);
    await assert.rejects(db.query('UPDATE paquete_beneficios SET entregada=5'));
    await db.close();
});
