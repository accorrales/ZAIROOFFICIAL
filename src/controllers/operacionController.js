const pool = require('../config/database');
const { createHash } = require('node:crypto');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const integer = (v) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1)
        throw fail('Identificador o cantidad inválida');
    return n;
};
const actor = req => {
    if (!req.user?.id)
        throw fail('Sesión sin responsable', 401);
    return `${req.user.rol}:${req.user.id}`;
};
function parseQR(qr) {
    if (typeof qr !== 'string' || qr.length > 4096)
        throw fail('QR inválido');
    let value;
    try {
        const data = JSON.parse(qr);
        if (data.tipo === 'ZAIRO_TICKET')
            value = data.uuid;
    }
    catch {
        value = qr.match(/\/t\/([a-f0-9-]+)/i)?.[1] || qr;
    }
    if (!uuidPattern.test(value || ''))
        throw fail('QR inválido');
    return value;
}
async function group(db, id, event) {
    const p = (await db.query(`SELECT p.id_paquete,p.id_compra,p.numero,p.id_evento,p.promocion,p.zona,p.integrantes,p.beneficios_descripcion,p.requiere_revision,p.mesa_tipo,p.id_mesa,m.identificador AS mesa
 FROM compra_paquetes p JOIN compras_entradas c ON c.id_compra=p.id_compra LEFT JOIN evento_mesas m ON m.id_mesa=p.id_mesa WHERE p.id_paquete=$1 AND p.id_evento=$2 AND c.estado='PAGADA'`, [id, event])).rows[0];
    if (!p)
        throw fail('Paquete no disponible', 404);
    p.miembros = (await db.query('SELECT id_detalle,nombre_completo,estado,fecha_ingreso FROM compra_entrada_detalles WHERE id_paquete=$1 ORDER BY id_detalle', [id])).rows;
    p.ingresados = p.miembros.filter(m => m.fecha_ingreso != null).length;
    p.beneficios = (await db.query('SELECT id_beneficio,nombre,cantidad,entregada,cantidad-entregada AS pendiente FROM paquete_beneficios WHERE id_paquete=$1 ORDER BY id_beneficio', [id])).rows;
    p.historial_mesas = (await db.query(`SELECT h.id,h.responsable,COALESCE(h.responsable_nombre,u.nombre,'Personal autorizado') AS responsable_nombre,h.motivo,h.fecha,COALESCE(h.anterior_etiqueta,a.identificador) AS anterior,COALESCE(h.nueva_etiqueta,n.identificador) AS nueva FROM mesa_historial h LEFT JOIN usuarios u ON u.id_usuario::text=split_part(h.responsable,':',2) LEFT JOIN evento_mesas a ON a.id_mesa=h.anterior LEFT JOIN evento_mesas n ON n.id_mesa=h.nueva WHERE h.id_paquete=$1 ORDER BY h.id DESC`, [id])).rows;
    p.entregas = (await db.query(`SELECT h.id,h.id_beneficio,b.nombre AS beneficio_nombre,h.cantidad,h.responsable,COALESCE(h.responsable_nombre,u.nombre,'Personal autorizado') AS responsable_nombre,h.motivo,h.fecha FROM beneficio_movimientos h JOIN paquete_beneficios b ON b.id_beneficio=h.id_beneficio LEFT JOIN usuarios u ON u.id_usuario::text=split_part(h.responsable,':',2) WHERE h.id_paquete=$1 ORDER BY h.id DESC`, [id])).rows;
    return p;
}
async function operation(req, res, kind, work) {
    let client;
    try {
        const key = req.body.operation_id;
        if (!uuidPattern.test(key || ''))
            throw fail('operation_id UUID requerido');
        const responsible = actor(req);
        const fingerprint = createHash('sha256').update(JSON.stringify({ kind, params: req.params, body: { ...req.body, operation_id: undefined } })).digest('hex');
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('INSERT INTO operaciones_acceso(operation_id,responsable,huella) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [key, responsible, fingerprint]);
        const prior = (await client.query('SELECT * FROM operaciones_acceso WHERE operation_id=$1 FOR UPDATE', [key])).rows[0];
        if (prior.responsable !== responsible || prior.huella !== fingerprint)
            throw fail('La operación pertenece a otra solicitud', 409);
        if (prior.respuesta) {
            await client.query('COMMIT');
            return res.set({ 'X-Zairo-Operation-Id': key, 'Access-Control-Expose-Headers': 'X-Zairo-Operation-Id' }).status(prior.estado_http).json(prior.respuesta);
        }
        await client.query('SAVEPOINT action');
        let status = 200, body;
        try {
            body = await work(client, responsible, key);
        }
        catch (e) {
            if (!e.status)
                throw e;
            await client.query('ROLLBACK TO SAVEPOINT action');
            status = e.status;
            body = { valido: false, message: e.message, ...(e.response || {}) };
        }
        await client.query('UPDATE operaciones_acceso SET estado_http=$2,respuesta=$3::jsonb WHERE operation_id=$1', [key, status, JSON.stringify(body)]);
        await client.query('COMMIT');
        res.set({ 'X-Zairo-Operation-Id': key, 'Access-Control-Expose-Headers': 'X-Zairo-Operation-Id' }).status(status).json(body);
    }
    catch (e) {
        if (client)
            await client.query('ROLLBACK');
        if (!e.status)
            console.error('operacion:', e.message);
        res.status(e.status || 503).json({ message: e.status ? e.message : 'No se pudo verificar. Recuperá el resultado o reintentá con la misma operación.' });
    }
    finally {
        client?.release();
    }
}
const read = fn => async (req, res) => {
    try {
        res.json(await fn(req));
    }
    catch (e) {
        if (!e.status)
            console.error(e.message);
        res.status(e.status || 503).json({ message: e.status ? e.message : 'No se pudo consultar; reintentá.' });
    }
};
exports.events = read(async () => (await pool.query("SELECT id_evento,nombre,fecha FROM eventos WHERE publicacion='PUBLICADO' ORDER BY fecha DESC")).rows);
exports.group = read(req => group(pool, integer(req.params.id), integer(req.query.id_evento)));
const tablesFor = async (event) => (await pool.query('SELECT m.id_mesa,m.identificador,m.zona,m.tipo,m.capacidad,p.id_paquete AS reserva FROM evento_mesas m LEFT JOIN compra_paquetes p ON p.id_mesa=m.id_mesa WHERE m.id_evento=$1 ORDER BY m.identificador', [event])).rows;
exports.tables = read(req => tablesFor(integer(req.query.id_evento)));
exports.reception = read(async (req) => {
    const event = integer(req.query.id_evento);
    const tables = await tablesFor(event);
    const packages = (await pool.query(`SELECT p.id_paquete,p.numero,p.id_compra,p.promocion,p.zona,p.integrantes,p.requiere_revision,p.mesa_tipo,p.id_mesa,m.identificador AS mesa,count(d.fecha_ingreso)::int AS ingresados FROM compra_paquetes p JOIN compras_entradas c ON c.id_compra=p.id_compra LEFT JOIN evento_mesas m ON m.id_mesa=p.id_mesa LEFT JOIN compra_entrada_detalles d ON d.id_paquete=p.id_paquete WHERE p.id_evento=$1 AND c.estado='PAGADA' GROUP BY p.id_paquete,m.identificador ORDER BY p.id_paquete`, [event])).rows;
    const review = Number((await pool.query(`SELECT count(*) n FROM compra_entrada_detalles d JOIN compras_entradas c ON c.id_compra=d.id_compra WHERE c.id_evento=$1 AND c.estado='PAGADA' AND d.id_paquete IS NULL`, [event])).rows[0].n);
    return { mesas: tables, paquetes: packages, entradas_revision: review };
});
exports.result = read(async (req) => {
    if (!uuidPattern.test(req.params.key))
        throw fail('Operación inválida');
    const row = (await pool.query('SELECT estado_http,respuesta FROM operaciones_acceso WHERE operation_id=$1 AND responsable=$2', [req.params.key, actor(req)])).rows[0];
    if (!row?.respuesta)
        throw fail('Resultado aún no disponible. Reintentá la misma operación.', 404);
    return { status: row.estado_http, body: row.respuesta };
});
exports.scan = (req, res) => operation(req, res, 'scan', async (db) => {
    const event = integer(req.body.id_evento), uuid = parseQR(req.body.qr_data);
    const found = (await db.query('SELECT id_compra FROM compra_entrada_detalles WHERE uuid_entrada=$1', [uuid])).rows[0];
    if (!found)
        throw fail('Entrada no encontrada', 404);
    const c = (await db.query('SELECT id_evento,estado FROM compras_entradas WHERE id_compra=$1 FOR SHARE', [found.id_compra])).rows[0];
    if (c.id_evento !== event)
        throw fail('Entrada de otro evento seleccionado', 409);
    if (c.estado !== 'PAGADA')
        throw fail('Compra no pagada. Acceso rechazado', 409);
    const d = (await db.query(`SELECT d.id_detalle,d.id_paquete,d.nombre_completo,d.estado,d.fecha_ingreso,d.fecha_invalidacion,d.bebida_cortesia,d.cortesia_tiquete_entregado,e.nombre AS evento,c.zona FROM compra_entrada_detalles d JOIN compras_entradas c ON c.id_compra=d.id_compra JOIN eventos e ON e.id_evento=c.id_evento WHERE d.uuid_entrada=$1 FOR UPDATE OF d`, [uuid])).rows[0];
    const invalid = !!d.fecha_invalidacion || d.estado === 'INVALIDADA';
    d.id_evento = event;
    delete d.fecha_invalidacion;
    if (invalid || d.estado !== 'CONFIRMADA' || d.fecha_ingreso) {
        const grupo = d.id_paquete ? await group(db, d.id_paquete, event) : null;
        const error = fail(invalid ? 'Entrada invalidada. Acceso rechazado' : d.estado === 'USADA' || d.fecha_ingreso ? 'Entrada ya utilizada. Acceso rechazado' : 'Entrada pendiente de confirmación', 409);
        error.response = { entrada: d, grupo, requiere_revision: !d.id_paquete || grupo.requiere_revision };
        throw error;
    }
    await db.query("UPDATE compra_entrada_detalles SET estado='USADA',fecha_ingreso=NOW() WHERE id_detalle=$1", [d.id_detalle]);
    d.estado = 'USADA';
    d.id_evento = event;
    delete d.fecha_invalidacion;
    const grupo = d.id_paquete ? await group(db, d.id_paquete, event) : null;
    return { valido: true, message: 'Acceso aprobado', entrada: d, grupo, requiere_revision: !d.id_paquete || grupo.requiere_revision };
});
exports.lookup = read(async (req) => {
    const event = integer(req.body.id_evento), uuid = parseQR(req.body.qr_data);
    const d = (await pool.query(`SELECT d.id_paquete FROM compra_entrada_detalles d JOIN compras_entradas c ON c.id_compra=d.id_compra WHERE d.uuid_entrada=$1 AND c.id_evento=$2 AND c.estado='PAGADA'`, [uuid, event])).rows[0];
    if (!d)
        throw fail('Entrada no disponible en este evento', 404);
    return d.id_paquete ? { grupo: await group(pool, d.id_paquete, event) } : { grupo: null, requiere_revision: true };
});
exports.table = (req, res) => operation(req, res, 'table', async (db, who) => {
    const event = integer(req.body.id_evento), name = String(req.body.identificador || '').trim(), type = String(req.body.tipo || '').trim(), capacity = integer(req.body.capacidad), zone = req.body.zona;
    if (!name || name.length > 40 || !type || type.length > 60 || capacity > 100 || !['VIP', 'GENERAL'].includes(zone))
        throw fail('Revisá identificador, zona, tipo y capacidad');
    if (req.params.id) {
        const id = integer(req.params.id);
        const t = (await db.query('SELECT id_mesa FROM evento_mesas WHERE id_mesa=$1 AND id_evento=$2 FOR UPDATE', [id, event])).rows[0];
        if (!t)
            throw fail('Mesa no encontrada', 404);
        if ((await db.query('SELECT 1 FROM compra_paquetes WHERE id_mesa=$1', [id])).rows.length)
            throw fail('Desasigná la reserva antes de modificar la mesa', 409);
        await db.query('UPDATE evento_mesas SET identificador=$2,zona=$3,tipo=$4,capacidad=$5 WHERE id_mesa=$1', [id, name, zone, type, capacity]);
        return { message: 'Mesa actualizada', responsable: who };
    }
    try {
        const table = (await db.query('INSERT INTO evento_mesas(id_evento,identificador,zona,tipo,capacidad) VALUES($1,$2,$3,$4,$5) RETURNING id_mesa', [event, name, zone, type, capacity])).rows[0];
        return { message: 'Mesa creada', ...table };
    }
    catch (e) {
        if (e.code === '23505')
            throw fail('Identificador de mesa ya existente en este evento', 409);
        throw e;
    }
});
exports.assign = (req, res) => operation(req, res, 'assign', async (db, who, key) => {
    const event = integer(req.body.id_evento), id = integer(req.params.id);
    const motive = String(req.body.motivo || '').trim();
    if (motive.length < 3 || motive.length > 500)
        throw fail('Motivo requerido (3–500 caracteres)');
    const p = (await db.query(`SELECT p.*,c.estado AS compra_estado FROM compra_paquetes p JOIN compras_entradas c ON c.id_compra=p.id_compra WHERE p.id_paquete=$1 AND p.id_evento=$2 FOR UPDATE OF p`, [id, event])).rows[0];
    if (!p || p.compra_estado !== 'PAGADA' || !p.mesa_tipo)
        throw fail('Paquete sin derecho a reserva de mesa', 409);
    const tableId = req.body.id_mesa == null ? null : integer(req.body.id_mesa);
    let newLabel = null;
    const oldLabel = p.id_mesa ? (await db.query('SELECT identificador FROM evento_mesas WHERE id_mesa=$1', [p.id_mesa])).rows[0]?.identificador : null;
    if (tableId) {
        const t = (await db.query('SELECT * FROM evento_mesas WHERE id_mesa=$1 FOR UPDATE', [tableId])).rows[0];
        if (!t || t.id_evento !== event || t.zona !== p.zona || t.tipo !== p.mesa_tipo || t.capacidad < p.integrantes)
            throw fail('Mesa incompatible con evento, zona, tipo o capacidad', 409);
        newLabel = t.identificador;
        if ((await db.query('SELECT 1 FROM compra_paquetes WHERE id_mesa=$1 AND id_paquete<>$2', [tableId, id])).rows.length)
            throw fail('Mesa ya reservada', 409);
    }
    if (p.id_mesa === tableId)
        return { message: 'La reserva ya está asignada', id_paquete: id };
    await db.query('UPDATE compra_paquetes SET id_mesa=$2 WHERE id_paquete=$1', [id, tableId]);
    await db.query(`INSERT INTO mesa_historial(id_paquete,anterior,nueva,responsable,motivo,operation_id,anterior_etiqueta,nueva_etiqueta,responsable_nombre) VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT nombre FROM usuarios WHERE id_usuario::text=split_part($4,':',2)))`, [id, p.id_mesa, tableId, who, motive, key, oldLabel, newLabel]);
    return { message: 'Reserva actualizada; ocupación física no verificada', id_paquete: id };
});
exports.deliver = (req, res) => operation(req, res, 'deliver', async (db, who, key) => {
    const id = integer(req.params.id), event = integer(req.body.id_evento), benefit = integer(req.body.id_beneficio);
    const quantity = Number(req.body.cantidad), motive = String(req.body.motivo || '').trim();
    if (!Number.isSafeInteger(quantity) || !quantity || Math.abs(quantity) > 1000)
        throw fail('Cantidad entera distinta de cero requerida');
    if (quantity < 0 && (req.user.rol !== 'admin' || motive.length < 3))
        throw fail('Solo administración puede corregir con motivo', 403);
    if (motive.length > 500)
        throw fail('Motivo demasiado largo');
    const b = (await db.query(`SELECT b.* FROM paquete_beneficios b JOIN compra_paquetes p ON p.id_paquete=b.id_paquete JOIN compras_entradas c ON c.id_compra=p.id_compra WHERE b.id_beneficio=$1 AND b.id_paquete=$2 AND p.id_evento=$3 AND c.estado='PAGADA' FOR UPDATE OF b`, [benefit, id, event])).rows[0];
    if (!b)
        throw fail('Beneficio no disponible', 404);
    if (b.entregada + quantity < 0 || b.entregada + quantity > b.cantidad)
        throw fail('La cantidad supera lo pendiente o lo previamente entregado', 409);
    await db.query('UPDATE paquete_beneficios SET entregada=entregada+$2 WHERE id_beneficio=$1', [benefit, quantity]);
    await db.query(`INSERT INTO beneficio_movimientos(id_paquete,id_beneficio,cantidad,responsable,motivo,operation_id,responsable_nombre) VALUES($1,$2,$3,$4,$5,$6,(SELECT nombre FROM usuarios WHERE id_usuario::text=split_part($4,':',2)))`, [id, benefit, quantity, who, motive || 'Entrega explícita', key]);
    return { message: quantity < 0 ? 'Corrección registrada con historial' : 'Entrega confirmada', id_paquete: id };
});
exports.courtesy = (req, res) => operation(req, res, 'courtesy', async (db, who, key) => {
    const id = integer(req.params.id), event = integer(req.body.id_evento);
    const row = (await db.query(`UPDATE compra_entrada_detalles d SET cortesia_tiquete_entregado=true,cortesia_tiquete_entregado_en=NOW() FROM compras_entradas c WHERE d.id_detalle=$1 AND c.id_compra=d.id_compra AND c.id_evento=$2 AND c.estado='PAGADA' AND d.estado IN ('CONFIRMADA','USADA') AND d.fecha_invalidacion IS NULL AND d.bebida_cortesia IS NOT NULL AND NOT COALESCE(d.cortesia_tiquete_entregado,false) RETURNING d.id_detalle`, [id, event])).rows[0];
    if (!row)
        throw fail('Tiquete individual no disponible o ya registrado', 409);
    await db.query(`INSERT INTO cortesia_movimientos(id_detalle,responsable,operation_id,responsable_nombre) VALUES($1,$2,$3,(SELECT nombre FROM usuarios WHERE id_usuario::text=split_part($2,':',2)))`, [id, who, key]);
    return { message: 'Tiquete individual registrado. No modifica los beneficios del paquete.' };
});
exports._test = { group, parseQR };
