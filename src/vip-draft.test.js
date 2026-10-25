const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('INFAMOUS draft requires exact date, stays inactive and is idempotent',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE eventos(id_evento INT PRIMARY KEY,nombre TEXT,fecha TIMESTAMPTZ);
      CREATE TABLE entrada_tiers(id_tier SERIAL,id_evento INT,nombre TEXT,descripcion TEXT,precio NUMERIC,entradas_por_paquete INT,zona TEXT,beneficios_paquete TEXT,cantidad_disponible INT,estado BOOLEAN);
      INSERT INTO eventos VALUES(1,'INFAMOUS — EL LLAMADO DE LAS ALMAS','2026-10-31 20:00:00-06'),(2,'INFAMOUS anterior','2025-10-31 20:00:00-06');`);
    const sql=fs.readFileSync(require.resolve('./sql/infamous_vip_draft.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    const rows=(await db.query('SELECT * FROM entrada_tiers')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].id_evento,1);assert.equal(rows[0].estado,false);
    assert.equal(rows[0].cantidad_disponible,5);assert.equal(rows[0].zona,'VIP');assert.equal(Number(rows[0].precio),75000);assert.equal(rows[0].entradas_por_paquete,6);
    await db.exec("INSERT INTO eventos VALUES(3,'INFAMOUS duplicado','2026-10-31 20:00:00-06')");
    await assert.rejects(db.exec(sql),/exactamente un evento/);
  } finally {await db.close();}
});
