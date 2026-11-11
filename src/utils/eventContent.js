const TYPES = ['historia', 'artistas', 'galeria', 'informacion'];
const sections = () => TYPES.map(tipo => ({ tipo, titulo: {historia:'La historia',artistas:'Artistas',galeria:'Galería',informacion:'Información'}[tipo], visible:true }));
const text = (value, max, name, required=false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${name}: texto inválido (máximo ${max})`);
  return value.trim();
};
const image = (value) => {
  const s = text(value, 2000, 'Imagen');
  if (!s || /^\/assets\/[a-zA-Z0-9/_.,% -]+$/.test(s)) return s;
  try { const u = new URL(s); if (u.protocol === 'https:' && !u.username && !u.password) return s; } catch {}
  throw new Error('Las imágenes deben usar HTTPS o una ruta /assets/ local');
};
const contrast = (a,b) => {
  const luminance = h => {
    const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  };
  const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (y+.05)/(x+.05);
};
function defaults(event) {
  return { nombre:event.nombre || '', descripcion:event.descripcion || '', fecha:event.fecha instanceof Date ? event.fecha.toISOString() : (event.fecha || ''), ubicacion:event.ubicacion || '', precio:Number(event.precio || 0), imagen:event.imagen || '', mapa_imagen_url:'', historia:'', concepto:'', artistas:[], imagenes:[], videos:[], colores:{fondo:'#080b0a',texto:'#f3f6ef',acento:'#c6ff57'}, secciones:sections(), ...event.contenido_publicado, ...event.contenido_borrador };
}
function validateContent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Contenido inválido');
  const allowed=['nombre','descripcion','fecha','ubicacion','precio','imagen','mapa_imagen_url','historia','concepto','artistas','imagenes','videos','colores','secciones'];
  if (Object.keys(data).some(k=>!allowed.includes(k))) throw new Error('El contenido incluye campos no permitidos');
  const d={nombre:text(data.nombre,180,'Nombre',true),descripcion:text(data.descripcion,2000,'Descripción'),fecha:text(data.fecha,60,'Fecha',true),ubicacion:text(data.ubicacion,500,'Ubicación pública'),precio:Number(data.precio),imagen:image(data.imagen),mapa_imagen_url:image(data.mapa_imagen_url||''),historia:text(data.historia,12000,'Historia'),concepto:text(data.concepto,2000,'Concepto')};
  if (!Number.isFinite(Date.parse(d.fecha))) throw new Error('Fecha inválida');
  if (!Number.isFinite(d.precio) || d.precio<0 || d.precio>100000000) throw new Error('Precio inválido');
  if (!Array.isArray(data.artistas) || data.artistas.length>30 || !Array.isArray(data.imagenes) || data.imagenes.length>20) throw new Error('Máximo 30 artistas y 20 imágenes');
  d.artistas=data.artistas.map(a=>({nombre:text(a.nombre,100,'Artista',true),descripcion:text(a.descripcion,1000,'Biografía'),imagen:image(a.imagen)}));
  d.imagenes=data.imagenes.map(a=>{const url=image(a.url);if(!url)throw new Error('La imagen necesita una URL');return {url,alt:text(a.alt,200,'Texto alternativo',true)};});
  if(data.videos!==undefined && (!Array.isArray(data.videos)||data.videos.length>3)) throw new Error('Máximo tres videos');
  d.videos=(data.videos||[]).map(v=>{const url=image(v.url);if(!url)throw new Error('El video necesita una URL');return {url,poster:image(v.poster),titulo:text(v.titulo,180,'Título de video',true)};});
  const c=data.colores;
  if (!c || ['fondo','texto','acento'].some(k=>typeof c[k]!=='string'||!/^#[a-fA-F0-9]{6}$/.test(c[k]))) throw new Error('Usá colores hexadecimales de seis dígitos');
  if (contrast(c.texto,c.fondo)<4.5 || contrast(c.acento,c.fondo)<4.5) throw new Error('Los colores necesitan más contraste: texto y acento 4.5:1');
  d.colores={fondo:c.fondo,texto:c.texto,acento:c.acento};
  if (!Array.isArray(data.secciones) || data.secciones.length!==TYPES.length || new Set(data.secciones.map(s=>s.tipo)).size!==TYPES.length) throw new Error('Las cuatro secciones prediseñadas deben aparecer una vez');
  d.secciones=data.secciones.map(s=>{
    if (!TYPES.includes(s.tipo) || typeof s.visible!=='boolean') throw new Error('Sección inválida');
    return {tipo:s.tipo,titulo:text(s.titulo,100,'Título de sección',true),visible:s.visible};
  });
  return d;
}
// Explicit public projection: no draft, location controls, recipients or SQL row spread.
function publicEvent(row, detail=false) {
  if (!row || row.publicacion==='BORRADOR') return null;
  const c=row.contenido_publicado || {};
  const base={id_evento:row.id_evento,nombre:c.nombre??row.nombre,fecha:c.fecha??row.fecha,imagen:c.imagen??row.imagen,estado:row.publicacion==='PUBLICADO'&&row.ventas_abiertas===true&&row.estado===true,mostrar_en_home:row.mostrar_en_home,destacado:row.destacado,publicacion:row.publicacion,ventas_abiertas:row.ventas_abiertas};
  if(row.publicacion==='PROXIMAMENTE') return {...base,modo:'PROXIMAMENTE'};
  const editorial={...defaults({...row,contenido_borrador:{},contenido_publicado:c})};
  editorial.secciones=editorial.secciones.filter(s=>s.visible);
  if(!editorial.secciones.some(s=>s.tipo==='historia')) {delete editorial.historia;delete editorial.concepto;}
  if(!editorial.secciones.some(s=>s.tipo==='artistas')) delete editorial.artistas;
  if(!editorial.secciones.some(s=>s.tipo==='galeria')) {delete editorial.imagenes;delete editorial.videos;}
  if(!editorial.secciones.some(s=>s.tipo==='informacion')) delete editorial.mapa_imagen_url;
  const result={...base,descripcion:c.descripcion??row.descripcion,ubicacion:c.ubicacion??row.ubicacion,precio:c.precio??row.precio,contenido:editorial};
  if(!detail){result.contenido={colores:editorial.colores};return result;}
  result.mapa_imagen_url=editorial.mapa_imagen_url;
  if(detail) result.ubicacion_visible_publicamente=!!row.ubicacion_visible_publicamente;
  if(detail && row.ubicacion_visible_publicamente) for(const key of ['ubicacion_secreta_nombre','ubicacion_secreta_direccion','ubicacion_secreta_google_maps_url','ubicacion_secreta_waze_url']) result[key]=row[key];
  return result;
}
module.exports={defaults,validateContent,publicEvent};
