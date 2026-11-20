# Solicitud de cambio No. 4 · Portal de clientes Websourcing

**Equipo Websourcing · Producto** · Fecha: 2026-11-20

| Campo | Detalle |
|---|---|
| Qué pidió el cliente (dueño) | Al empezar un desarrollo, el super administrador indica qué % de una semana del plan de IA se va a consumir. |
| Por qué está fuera del alcance | No está en los Módulos 7 ni 9 de los requerimientos aprobados v4. CLAUDE.md §9 regla 6 pide un tope por proyecto, pero hoy vive solo en `memoria-del-proyecto/presupuesto-ia.md`. |
| Propuesta | En cada proyecto, solo en la zona del super admin, una tarjeta interna "Consumo del equipo": % estimado de la semana al iniciar y por sprint, % real anotado a mano por sprint (el plan Pro no tiene un medidor que se pueda leer automáticamente), tope del proyecto y aviso al llegar al 80 %. |
| Regla obligatoria | Nunca visible al cliente ni a su equipo (CLAUDE.md §3). Lo verifican RLS y una prueba automática. En pantalla se llama "Consumo del equipo", sin nombrar herramientas. |
| Impacto en tiempo | Pequeño: una tabla, una tarjeta y sus pruebas. No mueve la entrega de hoy. |
| Impacto en otras funciones | Ninguno. |
| Horas estimadas | 1 a 2 |
| Valor | $0 (proyecto interno) |

**Decisión del dueño (interna):** regalar (incluida hoy, sin costo) · Fecha: 2026-11-20
