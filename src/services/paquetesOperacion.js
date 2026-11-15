function operationalConfig(body) {
    const items = body.beneficios_operativos ?? [];
    if (!Array.isArray(items) || items.length > 20)
        throw new Error('Máximo 20 beneficios operativos');
    const names = new Set();
    const benefits = items.map(item => {
        const nombre = String(item.nombre ?? '').trim();
        const cantidad = Number(item.cantidad);
        if (!nombre || nombre.length > 100 || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1000 || names.has(nombre.toLowerCase()))
            throw new Error('Revisá nombre único y cantidad entera de cada beneficio');
        names.add(nombre.toLowerCase());
        return { nombre, cantidad };
    });
    const mesa = body.mesa_tipo == null || body.mesa_tipo === '' ? null : String(body.mesa_tipo).trim();
    if (mesa && mesa.length > 60)
        throw new Error('Tipo de mesa inválido');
    if ((benefits.length || mesa) && Number(body.entradas_por_paquete ?? 1) < 2)
        throw new Error('Mesa y beneficios compartidos requieren paquete de varias entradas');
    return { benefits, mesa };
}
async function createPackages(client, compra, tier) {
    const people = (await client.query('SELECT id_detalle FROM compra_entrada_detalles WHERE id_compra=$1 ORDER BY id_detalle', [compra.id_compra])).rows;
    const size = Number(tier.entradas_por_paquete);
    if (!size || people.length % size)
        throw new Error('Distribución de paquetes inválida');
    const { benefits, mesa } = operationalConfig(tier);
    for (let start = 0; start < people.length; start += size) {
        const p = (await client.query(`INSERT INTO compra_paquetes(id_compra,id_evento,numero,promocion,zona,integrantes,beneficios_descripcion,mesa_tipo,requiere_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_paquete`, [compra.id_compra, compra.id_evento, start / size + 1, tier.nombre, tier.zona, size, tier.beneficios_paquete || '', mesa, !!(tier.beneficios_paquete?.trim() && !benefits.length && !mesa)])).rows[0];
        await client.query('UPDATE compra_entrada_detalles SET id_paquete=$1 WHERE id_detalle=ANY($2::int[])', [p.id_paquete, people.slice(start, start + size).map(x => x.id_detalle)]);
        for (const b of benefits)
            await client.query('INSERT INTO paquete_beneficios(id_paquete,nombre,cantidad) VALUES($1,$2,$3)', [p.id_paquete, b.nombre, b.cantidad]);
    }
    await client.query('UPDATE compras_entradas SET paquetes_version=1 WHERE id_compra=$1', [compra.id_compra]);
}
module.exports = { operationalConfig, createPackages };
