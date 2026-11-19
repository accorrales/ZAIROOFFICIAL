// User-facing administration errors. Never expose SQL, values or constraint names.
const records = {
 empleado: {label:'el empleado', linked:'Tiene planillas u otros registros asociados. Podés editarlo y cambiar su estado a Inactivo para conservar el historial.'},
 concepto: {label:'el concepto', linked:'Está asociado a novedades u otros registros de planilla. Conservá el concepto para mantener el historial.'},
 novedad: {label:'la novedad', linked:'Tiene registros asociados que deben conservarse para mantener el historial.'},
 planilla: {label:'la planilla', linked:'Contiene detalles de pago o novedades asociados. Conservá la planilla para mantener el historial.'},
 resumen: {label:'el resumen'}, departamentos: {label:'los departamentos'}
};
const fields = {nombre:'nombre',nombre_periodo:'período',cedula:'cédula',tipo:'tipo de concepto',estado:'estado',salario_base:'salario',cantidad:'cantidad',monto:'monto',porcentaje:'porcentaje',monto_fijo:'monto fijo',fecha_ingreso:'fecha de ingreso',fecha_inicio:'fecha de inicio',fecha_fin:'fecha de fin',id_empleado:'empleado',id_planilla:'planilla',id_concepto:'concepto',id_departamento:'departamento'};
const references = {fk_empleado_departamento:'El departamento seleccionado ya no existe.',fk_novedad_empleado:'El empleado seleccionado ya no existe.',fk_novedad_planilla:'La planilla seleccionada ya no existe.',fk_novedad_concepto:'El concepto seleccionado ya no existe.'};

function adminError(error, resource, action) {
 const record=records[resource]||{label:'el registro'};
 const partial=['procesar','confirmar'].includes(action);
 const result=(status,codigo,message)=>({status,body:{codigo,error:partial?message.replace(/ Consultá .*$/,'')+' Consultá el estado, el detalle y los totales antes de reintentar: la operación pudo haberse aplicado parcialmente.':message}});
 if(error.code==='23503') {
  if(action==='eliminar')return result(409,'ADMIN_REGISTRO_VINCULADO',`No se puede eliminar ${record.label}. ${record.linked||'Tiene registros asociados que deben conservarse.'}`);
  return result(409,'ADMIN_REFERENCIA_NO_DISPONIBLE',(references[error.constraint]||'Alguno de los registros seleccionados ya no está disponible.')+' Actualizá las opciones y revisá la selección.');
 }
 if(error.code==='23505') {
  const field=error.constraint==='empleados_cedula_key'?'esa cédula':error.constraint==='conceptos_pago_nombre_key'?'ese nombre de concepto':null;
  return result(409,'ADMIN_DUPLICADO',field?`Ya existe un registro con ${field}. Revisá el listado antes de guardar.`:`Ya existe un registro con esos datos. Revisá el listado antes de guardar ${record.label}.`);
 }
 if(error.code==='23502')return result(400,'ADMIN_CAMPO_OBLIGATORIO',fields[error.column]?`Completá el campo ${fields[error.column]} antes de guardar.`:'Faltan campos obligatorios. Revisá el formulario antes de guardar.');
 if(error.code==='23514') {
  const message={conceptos_pago_tipo_check:'El tipo de concepto debe ser Pago o Deducción.',empleados_salario_base_check:'El salario no puede ser negativo.',planillas_estado_check:'El estado de la planilla debe ser Pendiente, Procesada o Confirmada.',detalle_planilla_salario_base_check:'El salario de la planilla no puede ser negativo.',detalle_planilla_total_deducciones_check:'Las deducciones no pueden ser negativas.',detalle_planilla_total_ingresos_check:'Los ingresos no pueden ser negativos.'}[error.constraint];
  return result(422,'ADMIN_VALIDACION',message||'Los datos no cumplen las condiciones del registro. Revisá los valores y las opciones del formulario.');
 }
 if(['22P02','22003','22007','22008','22001'].includes(error.code))return result(400,'ADMIN_FORMATO_INVALIDO',error.code==='22001'?'Uno de los textos supera la longitud permitida. Revisá los campos del formulario.':error.code==='22003'?'Un importe o cantidad supera el rango permitido. Revisá los valores.':['22007','22008'].includes(error.code)?'Una fecha no es válida. Revisá las fechas del formulario.':'Un identificador, importe o cantidad tiene un formato inválido. Revisá los datos seleccionados.');
 const unavailable=['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNRESET','57P01','57P03','53300','57014','55P03','40001','40P01'].includes(error.code)||String(error.code||'').startsWith('08');
 if(unavailable)return result(503,action==='consultar'?'ADMIN_SERVICIO_NO_DISPONIBLE':'ADMIN_RESULTADO_INCIERTO',action==='consultar'?`No pudimos consultar ${record.label}: el servicio de datos no está disponible o tardó demasiado. Intentá consultar nuevamente.`:`No pudimos confirmar si se completó la operación sobre ${record.label}. Consultá su estado antes de volver a enviarla.`);
 return result(500,'ADMIN_ERROR_INTERNO',action==='consultar'?`No pudimos consultar ${record.label} por un problema del servidor. Intentá nuevamente; si continúa, contactá con administración.`:`No pudimos confirmar que se completara la operación sobre ${record.label}. Consultá el estado del registro antes de reintentar; si continúa, contactá con administración.`);
}
function respondAdminError(res,error,resource,action) {
 const response=adminError(error,resource,action);
 console.error('Operación administrativa rechazada',{resource,action,code:error.code||'UNKNOWN'});
 return res.status(response.status).json(response.body);
}
function recordNotFound(res,resource) {
 const label=(records[resource]||{label:'el registro'}).label;
 return res.status(404).json({codigo:'ADMIN_NO_EXISTE',error:`No se encontró ${label}. Puede haberse eliminado desde otra sesión. Actualizá el listado.`});
}
module.exports={adminError,respondAdminError,recordNotFound};
