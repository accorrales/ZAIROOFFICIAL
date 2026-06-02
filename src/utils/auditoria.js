const pool = require('../config/database');

const registrarAuditoria = async (
    tabla,
    idRegistro,
    accion,
    valorAnterior,
    valorNuevo,
    usuario = 'sistema'
) => {

    try {

        await pool.query(
            `INSERT INTO auditoria
            (tabla_afectada,
             id_registro_afectado,
             accion,
             valor_anterior,
             valor_nuevo,
             usuario_responsable)
             
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                tabla,
                idRegistro,
                accion,
                valorAnterior,
                valorNuevo,
                usuario
            ]
        );

    } catch (error) {

        console.error('Error registrando auditoría:', error);

    }

};

module.exports = registrarAuditoria;