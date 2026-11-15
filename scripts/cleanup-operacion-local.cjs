const fs = require('fs'), assert = require('node:assert/strict'), pool = require('../src/config/database');
assert.equal(process.env.ZAIRO_OPERATION_TEST, '1');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const file = process.env.OPERATION_FIXTURES || '/workspace/work/stage6-private-fixtures.json';
(async () => {
    const f = JSON.parse(fs.readFileSync(file));
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const events = f.events, actors = f.users.map(u => u.rol + ':' + u.id), ids = f.users.map(u => u.id);
        await c.query('DELETE FROM beneficio_movimientos WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM mesa_historial WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM cortesia_movimientos WHERE id_detalle IN (SELECT d.id_detalle FROM compra_entrada_detalles d JOIN compras_entradas c ON c.id_compra=d.id_compra WHERE c.id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM operaciones_acceso WHERE responsable=ANY($1::text[])', [actors]);
        await c.query('DELETE FROM purchase_status_history WHERE compra_id IN (SELECT id_compra FROM compras_entradas WHERE id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM compra_entrada_detalles WHERE id_compra IN (SELECT id_compra FROM compras_entradas WHERE id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM paquete_beneficios WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))', [events]);
        await c.query('DELETE FROM compra_paquetes WHERE id_evento=ANY($1::int[])', [events]);
        await c.query('DELETE FROM compras_entradas WHERE id_evento=ANY($1::int[])', [events]);
        await c.query('DELETE FROM entrada_tiers WHERE id_evento=ANY($1::int[])', [events]);
        await c.query('DELETE FROM evento_mesas WHERE id_evento=ANY($1::int[])', [events]);
        await c.query('DELETE FROM eventos WHERE id_evento=ANY($1::int[])', [events]);
        await c.query('DELETE FROM usuarios WHERE id_usuario=ANY($1::int[])', [ids]);
        await c.query('COMMIT');
        assert.equal(Number((await c.query('SELECT count(*) n FROM eventos WHERE id_evento=ANY($1::int[])', [events])).rows[0].n), 0);
        assert.equal(Number((await c.query('SELECT count(*) n FROM operaciones_acceso WHERE responsable=ANY($1::text[])', [actors])).rows[0].n), 0);
        console.log('PASS: only tagged stage 6 fixtures, users and operational records removed.');
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
