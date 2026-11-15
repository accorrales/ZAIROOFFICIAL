// Destructive ONLY to its own tagged fixtures. Explicit local opt-in; no real email.
const fs = require('fs'), assert = require('node:assert/strict'), crypto = require('crypto'), bcrypt = require('bcrypt'), pool = require('../src/config/database');
const base = process.env.OPERATION_TEST_URL || 'http://127.0.0.1:3002/api', file = process.env.OPERATION_FIXTURES || '/workspace/work/stage6-private-fixtures.json';
assert.equal(process.env.ZAIRO_OPERATION_TEST, '1');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const f = { users: [], events: [], purchases: [], operations: [], tables: [] }, tokens = {};
async function api(path, { role = 'admin', method = 'GET', body, status = 200 } = {}) { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await r.json(); assert.equal(r.status, status, `${role} ${method} ${path}: ${data.message || data.error || 'respuesta inesperada'}`); return data; }
const operation = async (path, body = {}, role = 'admin', status = 200, key = crypto.randomUUID()) => { f.operations.push(key); return api('/operacion' + path, { role, method: 'POST', body: { ...body, operation_id: key }, status }); };
const save = () => fs.writeFileSync(file, JSON.stringify(f), { mode: 0o600 });
const people = n => Array.from({ length: n }, (_, i) => ({ nombre_completo: `Integrante ficticio ${i + 1}`, fecha_nacimiento: '2000-01-01' }));
(async () => {
    const safety = await api('/qa-safety', { role: 'public' });
    assert.deepEqual(safety, { emailStub: true, notifications: false });
    const tag = crypto.randomUUID().slice(0, 8);
    f.password = crypto.randomBytes(24).toString('hex');
    const hash = await bcrypt.hash(f.password, 10);
    for (const role of ['admin', 'entrada', 'entrada2', 'contabilidad', 'rrhh', 'visor']) {
        const rol = role === 'entrada2' ? 'entrada' : role, correo = `stage6-${role}-${tag}@example.invalid`;
        const id = (await pool.query('INSERT INTO usuarios(nombre,correo,contrasena,rol) VALUES($1,$2,$3,$4) RETURNING id_usuario', ['Equipo ficticio ' + role, correo, hash, rol])).rows[0].id_usuario;
        f.users.push({ id, role, rol, correo });
        const login = await api('/auth/login', { role: 'public', method: 'POST', body: { correo, password: f.password } });
        tokens[role] = login.token;
        save();
    }
    for (let i = 0; i < 2; i++) {
        const name = `Evento ficticio de acceso ${i + 1}`;
        const content = require('../src/utils/eventContent').defaults({ nombre: name, fecha: '2099-12-01', historia: 'Historia de prueba' });
        const e = (await pool.query("INSERT INTO eventos(nombre,fecha,estado,publicacion,ventas_abiertas,mostrar_en_home,contenido_publicado,contenido_borrador) VALUES($1,'2099-12-01',true,'PUBLICADO',true,false,$2,$2) RETURNING id_evento", [name, content])).rows[0].id_evento;
        f.events.push(e);
        save();
    }
    const event = f.events[0];
    const config = { id_evento: event, nombre: 'Promoción ficticia · 6 VIP', precio: 75000, cantidad_disponible: 20, entradas_por_paquete: 6, zona: 'VIP', estado: true, mesa_tipo: 'COCTEL', beneficios_paquete: 'Mesa cóctel, 1 litro y 4 bebidas', beneficios_operativos: [{ nombre: 'Litro ficticio', cantidad: 1 }, { nombre: 'Bebida ficticia', cantidad: 4 }] };
    const vip = await api('/entrada-tiers', { method: 'POST', body: config, status: 201 });
    f.vipTier = vip.id_tier;
    const general = await api('/entrada-tiers', { method: 'POST', body: { id_evento: event, nombre: 'General ficticio', precio: 7000, cantidad_disponible: 50, entradas_por_paquete: 1, zona: 'GENERAL', estado: true }, status: 201 });
    f.generalTier = general.id_tier;
    save();
    async function buy(tier, n, paid = true) {
        const r = await api('/compras-entradas', { role: 'public', method: 'POST', body: { id_evento: event, id_tier: tier, correo_comprador: 'ficticio@example.invalid', telefono_comprador: '00000000', personas: people(n) }, status: 201 });
        const id = r.compra.id_compra;
        f.purchases.push(id);
        save();
        if (paid)
            await api(`/compras-entradas/${id}/confirmar`, { method: 'PATCH', body: {} });
        return { id, entries: (await pool.query('SELECT id_detalle,uuid_entrada,id_paquete FROM compra_entrada_detalles WHERE id_compra=$1 ORDER BY id_detalle', [id])).rows };
    }
    f.main = await buy(f.vipTier, 6);
    f.double = await buy(f.vipTier, 12);
    f.visual = await buy(f.vipTier, 6);
    f.general = await buy(f.generalTier, 1);
    f.race = await buy(f.generalTier, 1);
    f.invalid = await buy(f.generalTier, 1);
    f.unpaid = await buy(f.generalTier, 1, false);
    f.camera = await buy(f.generalTier, 1);
    f.courtesy = await buy(f.generalTier, 1);
    const pendingUUID = crypto.randomUUID();
    await pool.query('UPDATE compra_entrada_detalles SET uuid_entrada=$1 WHERE id_detalle=$2', [pendingUUID, f.unpaid.entries[0].id_detalle]);
    f.unpaid.entries[0].uuid_entrada = pendingUUID;
    save();
    const g1 = f.main.entries[0].id_paquete, g2 = f.double.entries[0].id_paquete, g3 = f.double.entries[6].id_paquete;
    assert.notEqual(g2, g3);
    assert.deepEqual(f.double.entries.map(e => e.id_paquete), [...Array(6).fill(g2), ...Array(6).fill(g3)]);
    const scan = (entry, role = 'entrada', status = 200, key = crypto.randomUUID(), id_evento = event) => operation('/escanear', { qr_data: entry.uuid_entrada, id_evento }, role, status, key);
    await scan(f.main.entries[0], 'entrada', 409, crypto.randomUUID(), f.events[1]);
    assert.equal((await pool.query('SELECT estado FROM compra_entrada_detalles WHERE id_detalle=$1', [f.main.entries[0].id_detalle])).rows[0].estado, 'CONFIRMADA');
    for (let i = 0; i < 6; i++) {
        const r = await scan(f.main.entries[i]);
        assert.equal(r.grupo.ingresados, i + 1);
        assert.ok(r.grupo.beneficios.every(b => b.entregada === 0));
    }
    await scan(f.main.entries[0], 'entrada', 409);
    await scan(f.visual.entries[0]);
    await scan(f.visual.entries[1]);
    const key = crypto.randomUUID();
    const race = await Promise.all([scan(f.race.entries[0], 'entrada', 200, key), scan(f.race.entries[0], 'entrada2', 409)]);
    assert.equal(race[0].grupo.ingresados, 1);
    await scan(f.race.entries[0], 'entrada', 200, key);
    await scan(f.general.entries[0], 'entrada', 409, key);
    await api('/dashboard-entradas/detalle/' + f.invalid.entries[0].id_detalle + '/invalidar', { method: 'PATCH', body: { motivo: 'Prueba ficticia' } });
    await scan(f.invalid.entries[0], 'entrada', 409);
    await scan(f.unpaid.entries[0], 'entrada', 409);
    const table = async (name, zona = 'VIP', capacidad = 6) => { const r = await operation('/mesas', { id_evento: event, identificador: name, zona, tipo: 'COCTEL', capacidad }); f.tables.push(r.id_mesa); save(); return r.id_mesa; };
    const a = await table('VIP A'), b = await table('VIP B'), bad = await table('GENERAL C', 'GENERAL');
    const assign = (g, t, status = 200) => operation('/paquetes/' + g + '/mesa', { id_evento: event, id_mesa: t, motivo: 'Prueba de reserva' }, 'admin', status);
    await assign(g1, bad, 409);
    await assign(f.general.entries[0].id_paquete, a, 409);
    const outcomes = await Promise.all([fetch(base + '/operacion/paquetes/' + g1 + '/mesa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.admin }, body: JSON.stringify({ operation_id: crypto.randomUUID(), id_evento: event, id_mesa: a, motivo: 'Concurrente A' }) }), fetch(base + '/operacion/paquetes/' + g2 + '/mesa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.admin }, body: JSON.stringify({ operation_id: crypto.randomUUID(), id_evento: event, id_mesa: a, motivo: 'Concurrente B' }) })]);
    assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
    const winner = (await pool.query('SELECT id_paquete FROM compra_paquetes WHERE id_mesa=$1', [a])).rows[0].id_paquete;
    await assign(winner, null);
    await assign(g1, a);
    await assign(g1, b);
    assert.ok(Number((await pool.query('SELECT count(*) n FROM mesa_historial WHERE id_paquete=$1', [g1])).rows[0].n) >= 2);
    await assign(f.visual.entries[0].id_paquete, a);
    const group = await api('/operacion/paquetes/' + g1 + '?id_evento=' + event, { role: 'entrada' });
    assert.ok(!/correo|telefono|precio|total|salario|fecha_nacimiento|uuid_entrada|ubicacion/.test(JSON.stringify(group)));
    const drink = group.beneficios.find(b => b.cantidad === 4), litre = group.beneficios.find(b => b.cantidad === 1);
    const deliver = (quantity, role = 'entrada', status = 200, key = crypto.randomUUID(), benefit = drink.id_beneficio) => operation('/paquetes/' + g1 + '/entrega', { id_evento: event, id_beneficio: benefit, cantidad: quantity, motivo: quantity < 0 ? 'Corrección ficticia' : 'Entrega ficticia' }, role, status, key);
    const deliveryKey = crypto.randomUUID();
    await deliver(1, 'entrada', 200, deliveryKey);
    await deliver(1, 'entrada', 200, deliveryKey);
    await deliver(1, 'entrada2');
    const concurrent = await Promise.all([fetch(base + '/operacion/paquetes/' + g1 + '/entrega', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.entrada }, body: JSON.stringify({ operation_id: crypto.randomUUID(), id_evento: event, id_beneficio: drink.id_beneficio, cantidad: 2 }) }), fetch(base + '/operacion/paquetes/' + g1 + '/entrega', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.entrada2 }, body: JSON.stringify({ operation_id: crypto.randomUUID(), id_evento: event, id_beneficio: drink.id_beneficio, cantidad: 2 }) })]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    await deliver(1, 'entrada', 409);
    await deliver(-1, 'entrada', 403);
    await deliver(-1, 'admin');
    const correction=(await api('/operacion/paquetes/'+g1+'?id_evento='+event,{role:'entrada'})).entregas.find(h=>h.cantidad<0);
    assert.deepEqual([correction.entregada_antes,correction.entregada_despues,correction.pendiente_antes,correction.pendiente_despues],[4,3,0,1]);
    await deliver(1, 'entrada');
    const later=(await api('/operacion/paquetes/'+g1+'?id_evento='+event,{role:'entrada'})).entregas.find(h=>h.id===correction.id);
    assert.deepEqual(later,correction); // Current balance is 4 again; history must still say 4 -> 3.

    const lostKey = crypto.randomUUID();
    await deliver(1, 'entrada', 200, lostKey, litre.id_beneficio);
    const recovered = await api('/operacion/operaciones/' + lostKey, { role: 'entrada' });
    assert.equal(recovered.status, 200);
    await deliver(1, 'entrada', 200, lostKey, litre.id_beneficio);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM beneficio_movimientos WHERE operation_id=$1', [lostKey])).rows[0].n), 1);
    await api('/operacion/operaciones/' + lostKey, { role: 'entrada2', status: 404 });
    await pool.query("UPDATE compra_entrada_detalles SET bebida_cortesia='PUNCH_CLUB',cortesia_tiquete_entregado=false WHERE id_detalle=$1", [f.courtesy.entries[0].id_detalle]);
    const courtesyScan = await scan(f.courtesy.entries[0]);
    assert.equal(courtesyScan.entrada.cortesia_tiquete_entregado, false);
    assert.equal(courtesyScan.grupo.beneficios.length, 0);
    const couponKey = crypto.randomUUID();
    await operation('/entradas/' + f.courtesy.entries[0].id_detalle + '/cortesia', { id_evento: event }, 'entrada', 200, couponKey);
    await operation('/entradas/' + f.courtesy.entries[0].id_detalle + '/cortesia', { id_evento: event }, 'entrada', 200, couponKey);
    await operation('/entradas/' + f.courtesy.entries[0].id_detalle + '/cortesia', { id_evento: event }, 'entrada2', 409);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM cortesia_movimientos WHERE id_detalle=$1', [f.courtesy.entries[0].id_detalle])).rows[0].n), 1);
    const second = await api('/operacion/paquetes/' + g2 + '?id_evento=' + event, { role: 'entrada' });
    await operation('/paquetes/' + g2 + '/entrega', { id_evento: event, id_beneficio: second.beneficios[0].id_beneficio, cantidad: 1 }, 'entrada');
    const third = await api('/operacion/paquetes/' + g3 + '?id_evento=' + event, { role: 'entrada' });
    assert.ok(third.beneficios.every(b => b.entregada === 0));
    for (const role of ['admin', 'entrada', 'contabilidad', 'rrhh', 'visor']) {
        const allowed = ['admin', 'entrada'].includes(role);
        await api('/operacion/recepcion?id_evento=' + event, { role, status: allowed ? 200 : 403 });
        await api('/operacion/mesas?id_evento=' + event, { role, status: allowed ? 200 : 403 });
        await api('/operacion/paquetes/' + g1 + '?id_evento=' + event, { role, status: allowed ? 200 : 403 });
        if (role !== 'admin') {
            await api('/operacion/mesas', { role, method: 'POST', body: {}, status: 403 });
            await api('/operacion/paquetes/' + g1 + '/mesa', { role, method: 'POST', body: {}, status: 403 });
        }
        if (!allowed)
            await api('/operacion/paquetes/' + g1 + '/entrega', { role, method: 'POST', body: {}, status: 403 });
    }
    await api('/operacion/paquetes/' + g1 + '?id_evento=' + f.events[1], { role: 'entrada', status: 404 });
    // Legacy multi-pack rows: no guessed membership or entitlements; safe individual migration.
    const legacy = (await pool.query("INSERT INTO compras_entradas(id_evento,id_tier,correo_comprador,telefono_comprador,cantidad,subtotal,descuento,total,estado,unidades_reservadas,zona,beneficios_paquete) VALUES($1,$2,'legacy@example.invalid','00000000',12,150000,0,150000,'PAGADA',2,'VIP','Descripción antigua') RETURNING id_compra", [event, f.vipTier])).rows[0].id_compra;
    f.purchases.push(legacy);
    for (let i = 0; i < 12; i++)
        await pool.query("INSERT INTO compra_entrada_detalles(id_compra,nombre_completo,fecha_nacimiento,uuid_entrada,estado) VALUES($1,'Anterior ficticio','2000-01-01',$2,'CONFIRMADA')", [legacy, crypto.randomUUID()]);
    f.legacy = legacy;
    const legacyEntry = (await pool.query('SELECT uuid_entrada FROM compra_entrada_detalles WHERE id_compra=$1 ORDER BY id_detalle LIMIT 1', [legacy])).rows[0];
    save();
    const sql = fs.readFileSync(require.resolve('../src/sql/operacion_paquetes.sql'), 'utf8');
    await pool.query(sql);
    await pool.query(sql);
    const oldScan = await scan(legacyEntry);
    assert.equal(oldScan.requiere_revision, true);
    assert.equal(oldScan.grupo, null);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM compra_paquetes WHERE id_compra=$1', [legacy])).rows[0].n), 0);
    await api('/entrada-tiers/' + f.vipTier, { method: 'PUT', body: { ...config, beneficios_operativos: [{ nombre: 'Beneficio nuevo', cantidad: 99 }], mesa_tipo: 'OTRA MESA' } });
    const snapshot = await api('/operacion/paquetes/' + g1 + '?id_evento=' + event, { role: 'entrada' });
    assert.equal(snapshot.mesa_tipo, 'COCTEL');
    assert.equal(snapshot.beneficios.find(b => b.id_beneficio === drink.id_beneficio).cantidad, 4);
    const auditSql = fs.readFileSync(require.resolve('../src/sql/operacion_auditoria_nombres.sql'), 'utf8');
    await pool.query(auditSql);
    await pool.query(auditSql);
    const balanceSql = fs.readFileSync(require.resolve('../src/sql/operacion_saldos_historicos.sql'), 'utf8');
    await pool.query(balanceSql);
    await pool.query(balanceSql);
    const auditBefore = [...snapshot.historial_mesas, ...snapshot.entregas].map(h => h.responsable_nombre);
    assert.ok(auditBefore.length > 0 && auditBefore.every(n => n.startsWith('Equipo ficticio ')));
    await pool.query("UPDATE usuarios SET nombre='Nombre cambiado ficticio' WHERE id_usuario=ANY($1::int[])", [f.users.map(u => u.id)]);
    const auditAfter = await api('/operacion/paquetes/' + g1 + '?id_evento=' + event, { role: 'entrada' });
    assert.deepEqual([...auditAfter.historial_mesas, ...auditAfter.entregas].map(h => h.responsable_nombre), auditBefore);
    for (const u of f.users)
        await pool.query('UPDATE usuarios SET nombre=$1 WHERE id_usuario=$2', ['Equipo ficticio ' + u.role, u.id]);
    f.results = { sixArrivals: true, twoPackages: true, scanRace: true, tableRace: true, deliverRace: true, idempotentRecovery: true, permissions: true, legacyReview: true, immutableSnapshot: true };
    save();
    console.log('PASS stage 6 real PostgreSQL/HTTP: six arrivals, two packages, scan/table/delivery races, history, roles, legacy migration and immutable entitlements. Fixtures retained privately for browser checks.');
})().catch(e => { save(); console.error(e.stack); process.exitCode = 1; }).finally(() => pool.end());
