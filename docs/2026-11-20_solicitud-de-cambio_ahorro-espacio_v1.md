# Solicitud de cambio No. 5 · Portal de clientes Websourcing

**Equipo Websourcing · Producto** · Fecha: 2026-11-20

| Campo | Detalle |
|---|---|
| Qué pidió el dueño | Controlar el consumo de espacio por cliente para atender 500 clientes con Supabase Pro base (USD 25/mes): límites, y archivar o borrar archivos viejos y videos. |
| Por qué está fuera del alcance | Los Módulos 5 y 6 de los requerimientos v4 no tienen cupos, archivo externo ni borrado automático. |
| Propuesta | 1) Cupo de espacio activo por empresa en Supabase, configurable por el super admin, de 1 GB por defecto. Al llegar al 80 % se avisa y al 100 % se bloquean las subidas nuevas con un mensaje claro. 2) Los videos de tickets van directo al archivo externo y no a Supabase. Máximo 20 MB, o un link de video. 3) Las imágenes se comprimen al subir. 4) A los 30 días de cerrado un proyecto, sus archivos se mueven al archivo externo y se borran de Supabase. La lista sigue visible en el portal y se recuperan a pedido. 5) El registro de actividad detallado se resume después de 12 meses. |
| Archivo externo | Por decidir: VPS de Hostinger (recomendado) o Google Drive. |
| Impacto en tiempo | Se construye hoy con el resto. El traslado al archivo externo se activa cuando el VPS esté listo. |
| Impacto en otras funciones | Tickets (adjuntos), Documentos y Archivos de la empresa, Dinero (comprobantes) y copia diaria (D-015). |
| Valor | $0 (proyecto interno) |

**Decisión del dueño (interna):** incluir (pedido por el dueño, 2026-11-20) · archivo externo: pendiente
