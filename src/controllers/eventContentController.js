const pool=require('../config/database');
const {defaults,validateContent}=require('../utils/eventContent');
const read=async id=>(await pool.query('SELECT * FROM eventos WHERE id_evento=$1',[id])).rows[0];
exports.obtener=async(req,res)=>{
 try {const row=await read(req.params.id);if(!row)return res.status(404).json({error:'Evento no encontrado'});res.json({contenido:defaults(row),revision:row.revision_editorial,publicacion:row.publicacion,ventas_abiertas:row.ventas_abiertas,mostrar_en_home:row.mostrar_en_home,destacado:row.destacado});}catch {res.status(500).json({error:'No se pudo cargar el borrador'});}
};
exports.guardar=async(req,res)=>{
 let content;try {content=validateContent(req.body.contenido);if(!Number.isInteger(req.body.revision))throw new Error('Revisión requerida');}catch(e){return res.status(400).json({error:e.message});}
 try {const result=await pool.query('UPDATE eventos SET contenido_borrador=$1, revision_editorial=revision_editorial+1 WHERE id_evento=$2 AND revision_editorial=$3 RETURNING revision_editorial',[content,req.params.id,req.body.revision]);if(!result.rows.length)return res.status(409).json({error:'El evento cambió o ya no existe. Recargá antes de guardar.'});res.json({contenido:content,revision:result.rows[0].revision_editorial});}catch {res.status(500).json({error:'No se pudo guardar el borrador'});}
};
exports.publicar=async(req,res)=>{
 const {publicacion,ventas_abiertas,mostrar_en_home,destacado,revision}=req.body || {};
 if(!['BORRADOR','PROXIMAMENTE','PUBLICADO'].includes(publicacion)||[ventas_abiertas,mostrar_en_home,destacado].some(v=>typeof v!=='boolean')||!Number.isInteger(revision))return res.status(400).json({error:'Configuración de publicación inválida'});
 if((ventas_abiertas&&publicacion!=='PUBLICADO')||(destacado&&(!mostrar_en_home||publicacion==='BORRADOR'))||(mostrar_en_home&&publicacion==='BORRADOR'))return res.status(400).json({error:'Un borrador es privado; las ventas requieren página publicada y el destacado debe estar visible en portada'});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  // Serialize featured changes, then lock event; purchases acquire a shared event lock.
  await client.query('SELECT pg_advisory_xact_lock(735019)');
  const row=(await client.query('SELECT * FROM eventos WHERE id_evento=$1 FOR UPDATE',[req.params.id])).rows[0];
  if(!row){await client.query('ROLLBACK');return res.status(404).json({error:'Evento no encontrado'});}
  if(row.revision_editorial!==revision){await client.query('ROLLBACK');return res.status(409).json({error:'El borrador cambió. Recargá antes de publicar.'});}
  const content=validateContent(defaults(row));
  if(destacado) await client.query('UPDATE eventos SET destacado=false, revision_editorial=revision_editorial+1 WHERE destacado=true AND id_evento<>$1',[req.params.id]);
  const result=await client.query(`UPDATE eventos SET publicacion=$1, ventas_abiertas=$2, estado=$2, mostrar_en_home=$3, destacado=$4, contenido_publicado=$5, contenido_borrador=$5, revision_editorial=revision_editorial+1, nombre=$7, descripcion=$8, fecha=$9, ubicacion=$10, precio=$11, imagen=$12 WHERE id_evento=$6 RETURNING revision_editorial`,[publicacion,ventas_abiertas,mostrar_en_home,destacado,content,req.params.id,content.nombre,content.descripcion,content.fecha,content.ubicacion,content.precio,content.imagen]);
  await client.query('COMMIT');res.json({publicacion,ventas_abiertas,mostrar_en_home,destacado,revision:result.rows[0].revision_editorial});
 }catch(e){await client.query('ROLLBACK');res.status(e.message.includes('contraste')||e.message.includes('inválid')?400:500).json({error:e.message.startsWith('No ') ? e.message : 'No se pudo publicar: '+(e.code?'error de almacenamiento':e.message)});}finally{client.release();}
};
