-- Sprint 5 · Ciclo de vida del ticket: crear, clasificar, responder, estados, resolver, confirmar,
-- calificar, cierre automatico a los 3 dias, notas internas y texto retirado.
begin;
select plan(75);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

-- A y B con garantia vigente (asi no son "fuera de plan"); C (pausada) tambien.
insert into public.garantias (empresa_id, inicia_en, vence_en) values
  (tests.id('empresa_a'), current_date - 5, current_date + 25), (tests.id('empresa_b'), current_date - 5, current_date + 25),
  (tests.id('empresa_c'), current_date - 5, current_date + 25);

-- ---------- Crear ----------
select tests.como(tests.id('equipo_a'));
select public.crear_ticket('error', '  La pagina no carga  ', 'Detalle del error', 'urgente') as r1 \gset
select (:'r1'::jsonb ->> 'ticket_id') as t1, (:'r1'::jsonb ->> 'numero') as n1 \gset
select is(:'n1'::int, 1, 'el primer ticket de A es el numero 1');
select is((:'r1'::jsonb ->> 'fuera_de_plan')::boolean, false, 'con garantia vigente el ticket no queda fuera de plan');
select isnt(:'r1'::jsonb ->> 'vence_primera_respuesta', null::text, 'el ticket nace con su fecha limite de primera respuesta');
select is((select titulo from public.tickets where id = :'t1'), 'La pagina no carga', 'el titulo se limpia de espacios');
select is((select estado from public.tickets where id = :'t1'), 'nuevo', 'nace en estado nuevo');
select is((select creado_por from public.tickets where id = :'t1'), tests.id('equipo_a'), 'creado_por es quien llama, no lo que mande la pantalla');
select is((select prioridad from public.tickets where id = :'t1'), null::text, 'la prioridad confirmada empieza vacia (la propuesta es del cliente)');
select (public.crear_ticket('pregunta', 'Una duda', 'Como cambio mi logo?', 'normal') ->> 'numero') as n2 \gset
select id as t2 from public.tickets where titulo = 'Una duda' \gset
select is(:'n2'::int, 2, 'el segundo ticket de A es el 2');
select ok(tests.error_es($$select public.crear_ticket('queja', 'Titulo', 'Detalle')$$, 'datos_invalidos'), 'tipo invalido se rechaza');
select ok(tests.error_es($$select public.crear_ticket('error', 'ab', 'Detalle')$$, 'datos_invalidos'), 'titulo demasiado corto se rechaza');
select ok(tests.error_es($$select public.crear_ticket('error', 'Titulo', '   ')$$, 'datos_invalidos'), 'detalle vacio se rechaza');
select ok(tests.error_es($$select public.crear_ticket('error', 'Titulo', 'Detalle', 'critica')$$, 'datos_invalidos'), 'prioridad invalida se rechaza');
select ok(tests.error_es($$select public.crear_ticket('error', 'Titulo', 'Detalle', 'alta', gen_random_uuid())$$, 'proyecto_no_disponible'), 'un proyecto que no se puede validar se rechaza');
select tests.como(tests.id('equipo_b'));
select (public.crear_ticket('error', 'Ticket de B', 'Detalle', 'alta') ->> 'numero') as nb \gset
select is(:'nb'::int, 1, 'la numeracion es por empresa: el primer ticket de B tambien es el 1');

-- ---------- Super admin: clasificar ----------
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t1'), 'transicion_invalida'), 'no se salta de nuevo a en progreso sin clasificar');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'critica')$$, :'t1'), 'datos_invalidos'), 'clasificar con prioridad invalida se rechaza');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'alta', 'solicitud_cambio')$$, :'t1'), 'tipo_invalido'), 'para volver algo solicitud de cambio se usa marcar_solicitud_cambio');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'alta')$$, gen_random_uuid()), 'ticket_no_encontrado'), 'ticket que no existe');
select is(public.clasificar_ticket(:'t1', 'alta') ->> 'estado', 'clasificado', 'clasificar pasa nuevo a clasificado');
select is((select prioridad from public.tickets where id = :'t1'), 'alta', 'la prioridad confirmada queda guardada');
select is((select prioridad_propuesta from public.tickets where id = :'t1'), 'urgente', 'la prioridad propuesta por el cliente no se pierde');
select isnt((select clasificado_en from public.tickets where id = :'t1'), null::timestamptz, 'queda la fecha de clasificacion');
select is(public.clasificar_ticket(:'t1', 'urgente', 'error') ->> 'prioridad', 'urgente', 'se puede reclasificar');
select is((select tipo_original from public.tickets where id = :'t1'), null::text, 'sin cambio de tipo no se guarda tipo_original');
select public.clasificar_ticket(:'t1', 'urgente', 'acceso');
select is((select tipo || '/' || tipo_original from public.tickets where id = :'t1'), 'acceso/error', 'si el dueno corrige el tipo, se guarda el original');
select public.clasificar_ticket(:'t1', 'urgente', 'error');

-- ---------- Responder ----------
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'Estamos revisando')$$, :'t1'), 'area_invalida'), 'responder como Websourcing exige el area');
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'Estamos revisando', false, 'Marketing')$$, :'t1'), 'area_invalida'), 'solo las 6 areas del equipo');
select is((select primera_respuesta_en from public.tickets where id = :'t1'), null::timestamptz, 'antes de responder no hay primera respuesta');
select public.responder_ticket(:'t2'::uuid, 'Nota interna: revisar logs', true);
select is((select primera_respuesta_en from public.tickets where id = :'t2'), null::timestamptz, 'una nota interna NO cuenta como primera respuesta');
select public.responder_ticket(:'t1', 'Estamos revisando el caso', false, 'Desarrollo');
select isnt((select primera_respuesta_en from public.tickets where id = :'t1'), null::timestamptz, 'la primera respuesta publica queda marcada');
select is((select semaforo from public.tickets_semaforo where ticket_id = :'t1'), 'cumplido', 'el semaforo queda en cumplido');
select is((select autor_id from public.ticket_mensajes where texto = 'Estamos revisando el caso'), null::uuid, 'el autor interno de una respuesta de Websourcing no se guarda en la fila visible');
select is((select area from public.ticket_mensajes where texto = 'Estamos revisando el caso'), 'Desarrollo', 'la respuesta se firma por area');

-- ---------- Estados ----------
select is(public.cambiar_estado_ticket(:'t1', 'en_progreso') ->> 'estado', 'en_progreso', 'clasificado a en progreso');
select is(public.cambiar_estado_ticket(:'t1', 'esperando_cliente') ->> 'estado', 'esperando_cliente', 'en progreso a esperando al cliente');
select tests.como(tests.id('equipo_a'));
select public.responder_ticket(:'t1', 'Aqui esta la informacion');
select is((select estado from public.tickets where id = :'t1'), 'en_progreso', 'si el cliente responde, el ticket vuelve a en progreso');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'resuelto')$$, :'t1'), 'resolucion_requerida'), 'resolver exige decir que se hizo');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'nuevo')$$, :'t1'), 'transicion_invalida'), 'no se vuelve a nuevo');
select is(public.cambiar_estado_ticket(:'t1', 'resuelto', 'Se corrigio la configuracion del servidor') ->> 'estado', 'resuelto', 'resolver con explicacion');
select is((select resolucion from public.tickets where id = :'t1'), 'Se corrigio la configuracion del servidor', 'el cliente puede ver que se hizo');
select isnt((select resuelto_en from public.tickets where id = :'t1'), null::timestamptz, 'queda la fecha de resolucion');
select tests.como(tests.id('equipo_a'));
select public.responder_ticket(:'t1', 'Sigue fallando');
select is((select estado from public.tickets where id = :'t1'), 'en_progreso', 'si el cliente responde a un resuelto, se reabre');
select tests.como(tests.id('sa'), 'aal2');
select public.cambiar_estado_ticket(:'t1', 'resuelto', 'Se ajusto de nuevo');

-- ---------- Confirmar y calificar ----------
select tests.como(tests.id('equipo_a2'));
select ok(tests.error_es(format($$select public.confirmar_resolucion(%L)$$, :'t1'), 'ticket_no_encontrado'), 'un companero sin permiso no ve ni confirma el ticket');
select tests.como(tests.id('equipo_a'));
select ok(tests.error_es(format($$select public.calificar_ticket(%L, 5)$$, :'t1'), 'ticket_no_cerrado'), 'no se califica antes de cerrar');
select ok(tests.error_es(format($$select public.confirmar_resolucion(%L)$$, :'t2'), 'ticket_no_resuelto'), 'solo se confirma un ticket resuelto');
select is(public.confirmar_resolucion(:'t1') ->> 'estado', 'cerrado', 'el cliente confirma y se cierra');
select is((select cierre_motivo from public.tickets where id = :'t1'), 'confirmado_cliente', 'cierre por confirmacion del cliente');
select ok(tests.error_es(format($$select public.calificar_ticket(%L, 6)$$, :'t1'), 'calificacion_invalida'), 'calificacion de 1 a 5');
select ok(tests.error_es(format($$select public.calificar_ticket(%L, 0)$$, :'t1'), 'calificacion_invalida'), 'calificacion 0 no vale');
select is(public.calificar_ticket(:'t1', 4, 'Buena atencion') ->> 'calificacion', '4', 'califica la atencion');
select ok(tests.error_es(format($$select public.calificar_ticket(%L, 5)$$, :'t1'), 'ya_calificado'), 'solo se califica una vez');
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'otra cosa')$$, :'t1'), 'ticket_cerrado'), 'un ticket cerrado no recibe mensajes');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'a.png', 'image/png', 100)$$, :'t1'), 'ticket_cerrado'), 'un ticket cerrado no recibe adjuntos');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t1'), 'ticket_cerrado'), 'un ticket cerrado no se mueve');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'baja')$$, :'t1'), 'ticket_cerrado'), 'un ticket cerrado no se reclasifica');

-- ---------- Triggers como defensa (superusuario) ----------
select tests.admin();
select ok(tests.error_es(format($$update public.tickets set titulo = 'Cambiado' where id = %L$$, :'t1'), 'ticket_cerrado'), 'un ticket cerrado solo admite la calificacion');
select ok(tests.error_es(format($$update public.tickets set estado = 'resuelto', resolucion = 'x que' where id = %L$$, :'t2'), 'transicion_invalida'), 'de nuevo no se pasa a resuelto');
select ok(tests.error_es(format($$update public.tickets set estado = 'clasificado' where id = %L$$, :'t2'), 'prioridad_requerida'), 'clasificar exige prioridad confirmada');

-- ---------- Cierre automatico a los 3 dias ----------
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta') as t_viejo \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta') as t_reciente \gset
select tests.ticket_directo(tests.id('empresa_c'), tests.id('miembro_admin_c'), tests.id('admin_c'), 'error', 'alta') as t_pausada \gset
-- se resuelven (fecha de resolucion puesta a mano) pasando por los estados validos
update public.tickets set prioridad = 'alta', estado = 'clasificado' where id in (:'t_viejo', :'t_reciente', :'t_pausada');
update public.tickets set estado = 'en_progreso' where id in (:'t_viejo', :'t_reciente', :'t_pausada');
update public.tickets set estado = 'resuelto', resolucion = 'Hecho y listo' where id in (:'t_viejo', :'t_reciente', :'t_pausada');
update public.tickets set resuelto_en = now() - interval '73 hours' where id = :'t_viejo';
update public.tickets set resuelto_en = now() - interval '47 hours' where id = :'t_reciente';
update public.tickets set resuelto_en = now() - interval '10 days' where id = :'t_pausada';
select is(private.cerrar_tickets_vencidos(), 1, 'el cierre automatico cierra solo el ticket con mas de 3 dias sin respuesta');
select is((select estado || '/' || cierre_motivo from public.tickets where id = :'t_viejo'), 'cerrado/automatico', 'queda cerrado de forma automatica');
select is((select estado from public.tickets where id = :'t_reciente'), 'resuelto', 'el de 2 dias sigue resuelto');
select is((select estado from public.tickets where id = :'t_pausada'), 'resuelto', 'las empresas pausadas se saltan');
select is(private.cerrar_tickets_vencidos(), 0, 'correrlo otra vez no repite trabajo');
select is((select count(*)::int from public.registro_actividad where accion = 'ticket_cerrado_automatico' and entidad_id = :'t_viejo'::text and actor_tipo = 'sistema'), 1, 'el cierre automatico queda en el registro como "sistema"');
select is((select count(*)::int from public.outbox_correos where tipo = 'ticket_estado' and datos ->> 'estado' = 'cerrado' and destinatario_user_id = tests.id('equipo_a')), 1, 'y se avisa por correo (cola) a quien creo el ticket');

-- ---------- Notas internas y texto retirado ----------
select tests.como(tests.id('equipo_a'));
select public.responder_ticket(:'t_reciente', 'Mi clave es Secreta123') ->> 'mensaje_id' as m_clave \gset
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.retirar_texto_mensaje(%L)$$, gen_random_uuid()), 'mensaje_no_encontrado'), 'retirar un mensaje que no existe');
select lives_ok(format($$select public.retirar_texto_mensaje(%L)$$, :'m_clave'), 'el super admin retira el texto de un mensaje');
select is((select texto from public.ticket_mensajes where id = :'m_clave'), '[Contenido retirado por el Equipo Websourcing]', 'el texto original ya no esta');
select ok(tests.error_es(format($$select public.retirar_texto_mensaje(%L)$$, :'m_clave'), 'mensaje_no_encontrado'), 'no se retira dos veces');
select is((select count(*)::int from public.registro_actividad where detalle::text ilike '%Secreta123%'), 0, 'el texto del mensaje nunca estuvo en el registro de actividad');
select is((select count(*)::int from public.registro_actividad where accion = 'ticket_mensaje_retirado'), 1, 'retirar el texto queda en el registro');
select tests.admin();
select ok(tests.error_es(format($$update public.ticket_mensajes set texto = 'otro' where id = %L$$, :'m_clave'), 'mensaje_ya_retirado'), 'un mensaje retirado no se vuelve a editar');
select ok(tests.error_es(format($$update public.ticket_mensajes set texto = 'editado' where id = (select id from public.ticket_mensajes where texto = 'Aqui esta la informacion')$$), 'tabla_solo_agregar'), 'los mensajes no se editan en silencio');
select ok(tests.error_es($$delete from public.ticket_mensajes$$, 'tabla_solo_agregar'), 'los mensajes no se borran');
select ok(tests.error_es($$delete from public.tickets$$, 'tabla_solo_agregar'), 'los tickets no se borran');

select * from finish();
rollback;
