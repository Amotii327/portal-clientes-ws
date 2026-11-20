# Lista de chequeo de auditoría

Marca solo las áreas del alcance acordado.

## Seguridad
- [ ] Contraseñas guardadas cifradas; inicio de sesión con segundo factor disponible.
- [ ] Cada pantalla y cada API revisa permisos en el servidor, no solo en la pantalla.
- [ ] Sin claves ni tokens en el código ni en el historial del repositorio.
- [ ] Entradas validadas (inyección SQL, scripts, subida de archivos).
- [ ] Dependencias sin vulnerabilidades conocidas.
- [ ] Encabezados de seguridad y HTTPS en todo.

## Separación entre empresas
- [ ] Reglas RLS activas en todas las tablas con datos de empresa.
- [ ] Prueba: un usuario de la empresa A no ve, edita ni borra nada de la B.

## Código y pruebas
- [ ] Pruebas automáticas de los recorridos principales; todas pasan.
- [ ] Manejo de errores consistente; nada de errores silenciosos.
- [ ] Sin código duplicado ni muerto relevante.

## Arquitectura
- [ ] Coincide con el documento de arquitectura y sus decisiones.
- [ ] Deuda técnica identificada y anotada.

## Escalabilidad y rendimiento
- [ ] Tiempo de carga de las pantallas principales en celular.
- [ ] Prueba de carga o estimación con 10 veces más usuarios.
- [ ] Procesos pesados en segundo plano, no mientras el usuario espera.
- [ ] Listados con paginación.

## Base de datos
- [ ] Tablas con relaciones y llaves bien definidas; sin datos duplicados innecesarios.
- [ ] Índices en las columnas que más se consultan; sin consultas lentas.
- [ ] Todos los cambios hechos con migraciones.
- [ ] Plan de crecimiento: tamaño actual y proyectado.

## UX/UI y accesibilidad
- [ ] `revision-de-pantallas.md` completa.
- [ ] Contraste y tamaños según WCAG AA; se puede usar con teclado.

## Datos personales (Ley 1581)
- [ ] Política de datos publicada y autorización del usuario registrada.
- [ ] Solo se guardan los datos necesarios; hay forma de borrarlos si el titular lo pide.
- [ ] Proveedores externos mencionados en contrato y política.

## Continuidad
- [ ] Copias de seguridad automáticas y una restauración probada en los últimos 3 meses.
- [ ] Monitoreo con aviso de caídas; registro de actividad de acciones sensibles.

## Infraestructura y costos
- [ ] Gasto mensual conocido por servicio; nada sobredimensionado ni al límite.

## Dependencias y licencias
- [ ] Librerías mantenidas y con licencias que permiten el uso comercial.

## Integraciones, pagos e IA (si aplican)
- [ ] Fallas de terceros manejadas (reintentos, avisos).
- [ ] No se guardan datos de tarjetas.
- [ ] IA del producto: tope de costo, datos sensibles protegidos, respuestas revisables.

## SEO y web (si aplica)
- [ ] Core Web Vitals en verde; metadatos y mapa del sitio.

## Documentación
- [ ] Alguien nuevo puede instalar y entender el sistema con la documentación técnica.
