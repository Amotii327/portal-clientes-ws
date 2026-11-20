# Salida a producción

## Antes
- [ ] El cliente firmó aceptación de las pruebas.
- [ ] Revisión de seguridad completa hecha por QA con Opus, sin problemas graves abiertos.
- [ ] Pruebas de todo el sistema y de velocidad pasan.
- [ ] Auditoría del Auditor sin hallazgos críticos ni altos abiertos.
- [ ] Portal de clientes (servidor): primer super admin creado a mano (pasos en `README.md`), con 2FA activado y códigos de respaldo guardados fuera del portal. Después de crearlo, comprobado que un correo sin invitación sigue sin poder registrarse (el gancho nunca se apagó).
- [ ] Portal de clientes (servidor): registro cerrado (gancho `before_user_created` activo; sin invitación nadie crea cuenta) y límites de intentos y captcha de Auth activos (riesgo aceptado: el gancho permite saber qué correos tienen invitación).
- [ ] Portal de clientes (servidor): `seguridad.exigir_2fa_admin_cliente` en `true` (2FA del admin del cliente, D-014), comprobado con una cuenta de prueba.
- [ ] Portal de clientes (servidor): plan Pro y gancho `password_verification_attempt` encendido (bloqueo de 5 intentos / 15 min), comprobado con una cuenta de prueba; revisión contra contraseñas filtradas activa.
- [ ] Portal de clientes (servidor): IP verificada contra el proyecto real de Supabase (qué cabecera llega y `configuracion('red')` ajustada). Hasta entonces la IP es dato de apoyo, no prueba única.
- [ ] Ambiente de producción separado del de prueba (base de datos y claves propias).
- [ ] Claves en el gestor de secretos.
- [ ] Copias de seguridad automáticas activas y una restauración probada.
- [ ] Monitoreo y aviso de caídas activos.
- [ ] Dominio y certificado de seguridad listos.
- [ ] Plan para volver a la versión anterior si algo falla.
- [ ] **Control 5: el dueño autorizó por escrito** (anotado en `aprobaciones.md`).

## Después
- [ ] Prueba rápida de los recorridos principales en producción.
- [ ] Manuales, documentación técnica y acta de entrega listos.
- [ ] Accesos entregados por canal seguro.
- [ ] Garantía de 30 días registrada en la línea de tiempo.
- [ ] Plan de mantenimiento activado.
