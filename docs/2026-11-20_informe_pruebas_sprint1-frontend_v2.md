# Informe de pruebas · Sprint 1 (pantallas) · Re-verificación · Portal de clientes Websourcing

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama: `claude/project-thread-g48cnm` · Commit revisado: `a830377` (más `9ad978a`, decisión D-019)
Alcance: lo corregido del informe v1 (`docs/2026-11-20_informe_pruebas_sprint1-frontend_v1.md`) y regresiones.

## Veredicto: pasa con condiciones

Los 5 hallazgos importantes quedaron cerrados. No hay bloqueantes ni regresiones. Quedan menores abiertos (ninguno de seguridad grave) y las condiciones de entorno que ya estaban en la lista de salida a producción (gancho de intentos con Supabase real, correos reales). Puede ir a la demo del punto de control 4, con los menores anotados en el acta.

Analogía: el guardia de la puerta ahora también revisa en la entrada del servidor, no solo desde el mostrador. Falta pintar algunas señales menores y probar el timbre con el edificio real.

## Pruebas

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| `npm run build` (prototipo) | Exporta igual; `out/` generado, rutas relativas aplicadas |
| `npm run build:servidor` | Compila; aparece la ruta nueva `/sin-permiso` |
| `npm run test:db` | "TODO BIEN" |
| `npm run test:e2e` (suite completa, `--trace off`) | **77 de 77 pasan** (antes 71), 0 saltadas, 0 fallidas. Sin `.skip`, `.fixme` ni `.only` en `tests/e2e` |

Se corrió la suite completa, no solo el archivo repetido por Frontend. Sigue siendo Supabase simulado y `next dev`.

## Estado de cada hallazgo del informe v1

| # | Estado | Evidencia |
|---|---|---|
| I-1 Mensaje de frenado | **Cerrado** | `lib/app/auth-errores.ts` agrega `esFrenada()` y `mensajeDeAuth` la traduce; `entrada.tsx` muestra "Cuenta frenada por 15 minutos" con enlace a cambiar contraseña; `activar.tsx` también. Pruebas nuevas `entrada.spec.ts:21` y `:206` (el simulador responde con el error del gancho). El aviso es el del diseño. Falta confirmarlo con Supabase real al encender el gancho (condición de entorno) |
| I-2 Revela correos | **Cerrado** | `auth-errores.ts:23`: `user_already_exists` da un mensaje neutro; `activar.tsx` ya no cambia a modo "entrar" solo. Queda el riesgo aceptado de `registro_solo_por_invitacion` (I-7b del informe de backend) |
| I-3 Rol validado solo en pantalla | **Cerrado** (ver punto siguiente) | `lib/servidor/guardia.ts` (`exigirRuta`) llama `mi_contexto()` y `rutaPermitida` en el servidor; se usa en `/admin/clientes`, `/admin/clientes/[id]`, `/cliente/equipo`, `/cliente/facturacion` y en `[...ruta]`. Prueba nueva `estados-permisos.spec.ts` para 5 casos (cliente a `/admin/*`, equipo a Mi equipo y facturación, super a `/cliente/*`): la respuesta redirige a `/sin-permiso` y no contiene la pantalla |
| I-4 Cancelar invitaciones | **Cerrado** | Botón "Cancelar invitación" con confirmación en Mi equipo (`mi-equipo.tsx`) y en el detalle del cliente; usa `revocarInvitacion`. Pruebas `admin-cliente.spec.ts` y `super-admin.spec.ts`; comprueban `revocada_en` y que el enlace cancelado ya no activa |
| I-5a Alcance de facturación | **Cerrado** | `memoria-del-proyecto/decisiones.md`: D-019, aprobada por el dueño el 2026-11-20 (adelanto del Módulo 4, no es alcance nuevo) |
| I-5b Prueba de 2FA del admin del cliente | **Cerrado** (corrección mía) | Ya existía `entrada.spec.ts:92` (`exigir_2fa_admin_cliente: true` lleva a `/verificar`); en el v1 escribí que no había prueba y fue un error. Sigue vigente la condición de producción: encender `seguridad.exigir_2fa_admin_cliente` |
| M-1 Token en URL e historial | **Abierto** | `activar.tsx` sin `history.replaceState` |
| M-2 Token en `emailRedirectTo` | **Abierto, aceptable** | `activar.tsx:76`; solo llega al correo del invitado |
| M-3 `empresaId` sin validar UUID | **Abierto** | `lib/servidor/invitaciones.ts` no cambió |
| M-4 Enlace dev en modo producción y texto falso | **Texto cerrado; prueba abierta** | Texto corregido: ahora dice que la invitación no se entrega y que se reinvita (`invitar.tsx:22-23`, probado). Sigue sin prueba con `NODE_ENV=production`; por código es correcta |
| M-5 Código de Supabase en el prototipo | **Abierto, menor** | Solo peso |
| M-6 Logo desalineado en Entrar | **Cerrado** | Captura nueva a 1440 px (abajo): el logo queda en el margen izquierdo, alineado con el título y el texto |
| M-7 Pantallas de muestra con datos de ejemplo | **Abierto, menor** | Siguen con el aviso "Disponible en el próximo sprint". Recomendado ocultar cifras; decisión del dueño |

Captura de verificación: `/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/entrar-1440-v2.png`. Se ve el logo alineado a la izquierda, el aviso "Cerraste sesión" y el formulario completo. El círculo "N" abajo a la izquierda es del modo desarrollo de Next y no aparece en producción.

## La limitación de I-3 (la URL no cambia): aceptable

Lo comprobé en la app corriendo. Como admin del cliente, navegué sin recargar a `/admin/clientes` (como lo haría un enlace interno): la barra de direcciones queda en `/admin/clientes` y se ve "Sin permiso", sin "Crear empresa" ni datos. Además pedí esa ruta al servidor como lo hace el navegador al navegar por dentro (cabecera `RSC`): la respuesta lleva la orden de ir a `/sin-permiso` y **no** incluye referencia a la pantalla de clientes.

Es aceptable por tres razones:

1. El servidor ya no envía la pantalla protegida; el efecto de seguridad que pedimos está logrado.
2. Los datos siguen protegidos por la base (RLS): aunque alguien viera la pantalla, no recibiría nada.
3. Que la URL quede igual es solo estético. Un cliente no tiene ningún enlace que lo lleve a `/admin`; solo llega escribiéndola, y en ese caso (recarga completa) sí cambia a `/sin-permiso`, lo que las pruebas verifican.

Mejora opcional (menor): que la comprobación del navegador use `router.replace('/sin-permiso')` para que la URL coincida. No bloquea.

## Regresiones buscadas

Prototipo publicado intacto (`npm run build`), middleware sin cambios, el token sigue sin llegar al navegador (`sin-enlace.spec.ts` pasa), sin menciones de IA en textos visibles (prueba pasa). Las 71 pruebas anteriores siguen en verde; las 6 nuevas también.

## Condiciones que siguen vigentes (no son de código)

1. Gancho de intentos encendido y probado con Supabase real (plan Pro).
2. `seguridad.exigir_2fa_admin_cliente` encendido antes de producción.
3. Envío real de correos para retirar el enlace de desarrollo.
4. I-6 del informe de backend: historial de git con menciones de IA (decisión del dueño antes de entregar el código; el commit `a830377` repite el patrón).
5. Menores M-1 a M-5 y M-7: pueden pasar al sprint 2 si el dueño lo acepta.

Decisión de Calidad: el frontend del sprint 1 **pasa con condiciones** y puede ir a la demo del punto de control 4.
