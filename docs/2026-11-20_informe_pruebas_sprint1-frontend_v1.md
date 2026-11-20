# Informe de pruebas · Sprint 1 (pantallas) · Portal de clientes Websourcing

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama: `claude/project-thread-g48cnm` · Commit revisado: `8a9fb29` (sobre el backend corregido `ee91d97`)

## Veredicto: pasa con condiciones

El punto de seguridad más delicado (I-4, el token de invitación) está bien resuelto y probado. Las pruebas pasan completas. Hay **0 bloqueantes**, 5 importantes y 6 menores. Los importantes deben corregirse (o aceptarse por escrito) antes de la demo del punto de control 4. Ninguno deja entrar a nadie donde no debe, porque la base (RLS) sigue siendo la que manda.

Analogía: el cajero del banco (la pantalla) entrega bien el dinero y la bóveda (la base) está bien cerrada. Pero el letrero de "cuenta bloqueada" no está colgado y la puerta de servicio de las rutas depende de un guardia que solo mira desde adentro.

## Pruebas corridas

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| `npm run build` (prototipo) | Exporta igual: `out/` con `index.html`, `404.html`, `marca/`; `postbuild` aplica rutas relativas en 7 archivos. El prototipo no se rompió |
| `npm run build:servidor` | Compila. 12 rutas, incluida `/cliente/facturacion` y el middleware |
| `npm run test:e2e` (Chrome del equipo, `--trace off`) | **71 de 71 pasan**, 0 saltadas, 0 fallidas (5 min) |
| `npm run test:db` | "TODO BIEN": migraciones suben, bajan y suben otra vez sin errores (incluida `000700`) |
| Pruebas saltadas o desactivadas | Búsqueda de `.skip`, `.fixme`, `.only`, `fail(` en `tests/e2e` y `supabase/tests`: ninguna |

Límites de lo probado: las pruebas e2e usan un Supabase **simulado** (`tests/mock-supabase/servidor.mjs`) y `next dev`. No se probó contra Supabase real ni con `next start` en modo producción.

## 1. Seguridad

| Punto | Resultado |
|---|---|
| I-4 token no llega al navegador | **Cumple.** `crearEmpresa` e `invitarMiembro` solo se llaman desde `lib/servidor/invitaciones.ts` (`'use server'`); el tipo `ResultadoCrear` no tiene campo `token`. Ningún componente importa `crearEmpresa`/`invitarMiembro` de `acciones.ts`. Sin `console.*` en `lib/`, `components/`, `app/`. `tests/e2e/sin-enlace.spec.ts:18-54` revisa HTML, todas las respuestas, `localStorage` y cookies con el token real del simulador: pasa |
| Condición del enlace "solo desarrollo" | `lib/servidor/invitaciones.ts:27`: `esSuper && NODE_ENV !== 'production' && MOSTRAR_ENLACE_INVITACION_DEV === 'true'`. `esSuper` sale de `miContexto()` en el servidor (la base, con 2FA), no de lo que mande el navegador. Correcto. Ver M-4 |
| Referer / caché del enlace | `next.config.mjs` pone `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en `/activar`; la página también declara `referrer` y `noindex`. Hay prueba (`entrada.spec.ts:236`). Ver M-1 y M-2 |
| Llave de servicio | No aparece en `components/`, `lib/`, `app/`. `lib/supabase/env.ts` solo lee las dos variables públicas. `.env.example` sin valores reales |
| Middleware y rutas | Ver I-3 |
| Validación en acciones de servidor | `lib/servidor/invitaciones.ts:19-45`: recorta, limita largo, valida correo y fuerza `rol` a `equipo` salvo `admin_cliente` explícito; la base vuelve a validar. Ver M-3 |
| Errores que no revelan correos | Recuperar contraseña responde igual exista o no (`entrada.tsx:71-72`). Inicio de sesión da un solo mensaje. Excepción: I-2 |
| 2FA (aal2), D-014 | Super admin: `layout.servidor.tsx:21` y `app/page.servidor.tsx:14` redirigen a `/verificar` según `mi_contexto()` (la base). Admin cliente: el frontend ya maneja `requiere_2fa`, pero **no hay prueba** de ese estado y depende de que la base tenga `seguridad.exigir_2fa_admin_cliente` encendido (ver I-5) |

## 2. Integración con el backend (`ee91d97`)

| Punto | Resultado |
|---|---|
| `aceptar_invitacion` sin `p_ip` | **Cumple.** `activar.tsx:107` envía solo `p_token`, `p_version_politica`, `p_nombre`, `p_celular` |
| `revocar_invitacion` | La función existe en `lib/portal/acciones.ts:22` pero **ninguna pantalla la usa** (I-4) |
| `cuenta_frenada_temporalmente` | El texto existe en `lib/portal/errores.ts:18`, pero el inicio de sesión usa `mensajeDeAuth` (`lib/app/auth-errores.ts`), que no lo traduce y cae en el mensaje genérico (I-1) |

## 3. Alcance

- **`/cliente/facturacion`**: no está en el mapa de pantallas ni en el plan del sprint 1 (el mapa la incluye dentro de `/cliente/dinero`, sprint 4). Sí está en los requerimientos aprobados: Módulo 4, "Puedo ver y editar los datos de facturación" (imprescindible), y el backend del sprint 1 ya trae la tabla y sus reglas (matriz de permisos). Conclusión: **no es una función nueva, es una pieza del Módulo 4 adelantada** sin registro. Necesita decisión del dueño y nota en `memoria-del-proyecto/cambios.md` o `aprobaciones.md`. Ver I-5.
- **Prototipo y app real**: conviven por `pageExtensions` y `NEXT_PUBLIC_MODO`; el prototipo exporta como antes. Menor: M-5.

## 4. Revisión visual (capturas en 390 y 1440, claro y oscuro)

Revisadas: entrar, Mi equipo (1440 y 390), crear empresa con enlace de desarrollo (oscuro), invitación creada, inicio de muestra. Lista `revision-de-pantallas.md`:

- Alineación, espacios, tipografía, colores y botones: consistentes con el sistema de diseño aprobado. Ok.
- Contraste: se lee bien en ambos temas. Ok.
- Celular: sin scroll lateral en las capturas de 390. Ok.
- Estados vacío, error, cargando y sin permiso: existen y tienen capturas. Ok.
- Textos: sin errores ni "lorem ipsum". Ok.
- Observaciones: M-6 (logo desalineado en 1440 de Entrar) y M-7 (el indicador "N" de Next tapa "Equipo Websourcing" y "Cerrar sesión"; es solo del modo desarrollo, no aparece en producción).
- No se pudo comparar pixel a pixel con el prototipo; se comparó con el mapa de pantallas por contenido y estructura.

## 6. Menciones de IA o personas inventadas

Sin hallazgos en textos visibles. Hay prueba automática (`estados-permisos.spec.ts:34`). Los nombres de las capturas ("Admina Prueba", "Equipo Uno") son datos del simulador de pruebas, no del producto. Persiste I-6 del informe de backend (historial de git y coautoría con nombre de modelo; autor del commit `8a9fb29`: "Claude"): decisión del dueño antes de entregar el código.

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

| # | Hallazgo | Evidencia | Qué hacer |
|---|---|---|---|
| I-1 | **El mensaje de frenado (5 intentos, 15 min) no se muestra.** El backend lo devuelve como `cuenta_frenada_temporalmente`, pero la pantalla de entrar lo trata con `mensajeDeAuth`, que solo reconoce `registro_solo_por_invitacion`, códigos de Auth y límites 429; todo lo demás sale como "No pudimos completar la acción". El informe de Frontend decía que el bloqueo "no existe": ya existe en la base. Tampoco hay prueba. El diseño aprobado pide mostrarlo (mapa 1.1, Iniciar sesión) | `lib/app/auth-errores.ts:6-25`; `components/portal/entrada.tsx:34`; `activar.tsx:72,89`; el aviso solo existe en el prototipo `screens/entrada.tsx:60` | Reconocer el texto `cuenta_frenada_temporalmente` en `mensajeDeAuth` (en entrar y en activar) y mostrar el aviso con la salida "cambiar contraseña". Agregar prueba en el simulador. Se confirma con Supabase real cuando se encienda el gancho (Pro) |
| I-2 | **Revela que un correo existe.** En activar, `user_already_exists` cambia la pantalla a "Ese correo ya tiene una cuenta". Está limitado a correos con invitación vigente (el gancho filtra antes), pero el reglamento de Calidad pide no revelarlo. Además `registro_solo_por_invitacion` distingue "con y sin invitación" (riesgo ya aceptado en I-7b del informe de backend) | `activar.tsx:79`; `auth-errores.ts:18` | Mensaje neutro ("Si el correo tiene invitación, te enviamos un mensaje; si ya tienes cuenta, entra desde Entrar"), sin cambiar de modo solo. Decisión del dueño si prefiere mantener la comodidad |
| I-3 | **Rol y 2FA se validan en el servidor solo hasta "hay sesión" y "estado de la cuenta"; la pertenencia a la zona (`/admin` solo super admin, `/cliente` solo clientes, Mi equipo solo admin) se decide únicamente en el navegador** (`rutaPermitida` corre en `Interior`, componente de cliente). Un admin de cliente que abre `/admin/clientes` pasa el middleware y el layout; el navegador es quien le muestra "Sin permiso". No hay fuga de datos porque la base (RLS) no entrega nada, pero se pidió que el servidor también valide, y los layouts de App Router no se vuelven a ejecutar en navegación interna entre páginas | `lib/supabase/middleware.ts:10,38-45` (solo sesión); `app/(privado)/layout.servidor.tsx:14-27` (no llama `rutaPermitida`); `zona-privada.tsx:29-31`; `lib/app/rutas.ts:14` | Llamar `rutaPermitida` en el servidor (páginas de `/admin/*`, `/cliente/equipo`, `/cliente/facturacion`) con `notFound()` o redirección. Mantener la copia de pantalla. Añadir prueba que compruebe que la respuesta del servidor no trae la pantalla |
| I-4 | **Falta cancelar invitaciones pendientes.** `revocar_invitacion` (M-4 del informe de backend) está lista y probada en la base, pero ninguna pantalla la llama. En Mi equipo y en el detalle del cliente las pendientes solo se listan | `acciones.ts:22` sin usos; `mi-equipo.tsx:116-127` | Botón "Cancelar invitación" con confirmación en ambas pantallas, usando `revocarInvitacion` y `mensajeDeError`. Si el dueño prefiere dejarlo para el sprint 2, anotarlo en el acta |
| I-5 | **Alcance y condiciones de 2FA sin registrar.** (a) `/cliente/facturacion` es el Módulo 4 adelantado y no está en el mapa ni en el plan; sin aprobación anotada. (b) El 2FA del admin del cliente (D-014) solo se exige cuando la base tiene `exigir_2fa_admin_cliente` encendido; en las pruebas no se cubre `requiere_2fa` | `components/portal/facturacion.tsx`; `shell.tsx:59`; `lib/app/rutas.ts:10-12`; `tests/e2e` sin `requiere_2fa` | (a) El dueño decide: dejarla como adelanto (se anota en `cambios.md` y el mapa) o apagarla hasta el sprint 4. (b) Agregar prueba de `requiere_2fa` para admin del cliente y mantener "2FA del admin del cliente encendido" en la lista de salida a producción |

### Menores

| # | Hallazgo | Evidencia |
|---|---|---|
| M-1 | El token se queda en la barra de direcciones y el historial del navegador después de activar. Conviene limpiar la URL (`history.replaceState`) al leer el token | `activar.tsx:53` |
| M-2 | `emailRedirectTo: window.location.href` incluye el token, así que viaja a Auth de Supabase y queda dentro del correo de confirmación (solo al correo invitado). Aceptable, pero anotarlo. Alternativa: guardar el token en `sessionStorage` de forma efímera y redirigir sin él | `activar.tsx:76` |
| M-3 | `empresaId` no se valida como UUID en la acción de servidor (la base igual rechaza, pero con mensaje genérico). `esUuid` ya existe | `lib/servidor/invitaciones.ts:39-41` |
| M-4 | La condición del enlace de desarrollo solo se probó con `next dev`; nunca con `next start` (producción). Por código es correcta, pero conviene una prueba con `NODE_ENV=production` y la variable en `true`. También: si un admin del cliente invita, el texto dice "El mensaje saldrá en cuanto activemos el envío de correos", pero el token no se guarda en ningún sitio, así que esa invitación **nunca se entregará** (hay que reinvitar). El texto promete algo falso | `invitar.tsx:21-23`; `enviar-invitacion.ts` devuelve `enviado: false` |
| M-5 | El prototipo publicado incluye el código del cliente de Supabase en sus archivos (`out/_next/static/chunks/595-...js`, `44530001-...js`). No trae claves ni afecta el uso, solo peso | `out/` |
| M-6 | En Entrar a 1440 px el logo queda centrado en su columna mientras el texto está pegado a la izquierda (no alinea con la rejilla) | `capturas-s1/1440_clara_01-entrar.png` |
| M-7 | Las pantallas "de muestra" (Inicio, Revisiones, etc.) muestran a clientes reales datos de ejemplo (proyecto "App de pedidos", saldos, 4 tickets) con un aviso arriba. Está marcado, pero un cliente real puede confundirlo con lo suyo. Recomendado: ocultar cifras en la demo real o dejar solo el aviso. El indicador "N" de Next tapa botones solo en desarrollo | `components/portal/muestra.tsx`; `capturas-s1/1440_clara_14-cliente-inicio-muestra.png` |

## Condiciones para cerrar el sprint

1. Corregir I-1, I-3 y I-4, o que el dueño acepte por escrito cada uno (I-4 se puede pasar al sprint 2).
2. Decisión del dueño sobre I-2 y sobre `/cliente/facturacion` (I-5a); anotar en `memoria-del-proyecto/`.
3. Agregar la prueba de `requiere_2fa` y la del frenado (I-1, I-5b). Devolver a Calidad para una re-verificación corta.
4. Antes de producción (ya en la lista de salida): gancho de intentos encendido y probado con Supabase real, 2FA del admin del cliente encendido, envío real de correos (Resend) para retirar el enlace de desarrollo, y cumplir I-6 del informe de backend (historial con menciones de IA).

Decisión de Calidad: el frontend del sprint 1 **pasa con condiciones**. No debe ir a la demo del punto de control 4 hasta que se resuelvan o se acepten las condiciones 1 y 2.
