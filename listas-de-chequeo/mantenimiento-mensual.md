# Rutina de mantenimiento

Como la revisión periódica de un carro: no se espera a que se vare.

> **Antes de empezar:** revisa `memoria-del-proyecto/mantenimiento.md`. Si el estado no es **activo**, no se hace esta rutina. Si está activo, haz solo lo contratado y con la frecuencia contratada; los planes de abajo son la referencia cuando no se pactó otra cosa.

## Cada revisión preventiva (DevOps, tantas veces por semana como se contrató)
- [ ] Monitoreo: hubo caídas o alertas? Se atendieron?
- [ ] Errores nuevos en los registros; los repetidos se vuelven ticket.
- [ ] Copias de seguridad corriendo sin fallas.
- [ ] Tickets abiertos dentro del tiempo de respuesta del plan.

## Cada mes (DevOps, con apoyo de QA)
- [ ] Parches de seguridad aplicados (Estándar y Premium; Básico cada trimestre), probados primero en el ambiente de prueba.
- [ ] Prueba de restauración de una copia (Estándar y Premium).
- [ ] Dominio, certificado y correos del sistema vigentes (avisar 30 días antes de vencer).
- [ ] Espacio, velocidad y capacidad de servidores revisados.
- [ ] Revisión de accesos: usuarios inactivos, permisos, intentos sospechosos.
- [ ] Bolsa de horas: usadas y restantes anotadas en `memoria-del-proyecto/mantenimiento.md`.
- [ ] Costos de servidores y servicios del mes anotados.
- [ ] `plantillas/reporte-mensual.md` lleno y revisado por el dueño antes de enviarlo.
- [ ] Preguntas que se repiten agregadas al manual.

## Cada trimestre
- [ ] Auditoría del Auditor (corta en Estándar, completa en Premium).
- [ ] Reunión de revisión con el cliente (Estándar; mensual en Premium).
- [ ] Hoja de ruta de mejoras (Premium).
- [ ] ¿El plan sigue siendo el adecuado? Si siempre se pasa de horas o crece mucho el uso, proponer subir de plan.

## Cada año
- [ ] Revisar el valor del plan (ajuste anual, más usuarios o más integraciones).
- [ ] Actualizar librerías y versiones mayores con un plan aprobado por el dueño.
