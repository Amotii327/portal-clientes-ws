import { codigoDeError, mensajeDeError } from './errores';

/**
 * Códigos de error de revisiones y documentos (sprint 3). Mismo formato que `errores.ts`: la base responde con
 * un código estable en `error.message`; aquí se traduce a un mensaje amable. Nunca se muestra el texto técnico.
 * Los códigos de los sprints 1 y 2 (por ejemplo `no_autorizado`, `ver_como_solo_lectura`) siguen en `errores.ts`.
 */
const MENSAJES: Record<string, string> = {
  // Revisiones
  revision_no_encontrada: 'No encontramos esa revisión.',
  revision_ya_existe: 'Ese diseño o sprint ya tiene su revisión: para una nueva ronda se crea una versión.',
  revision_sin_contenido: 'Agrega el link de prueba o el video antes de publicar.',
  revision_ya_publicada: 'La revisión ya está publicada.',
  revision_ya_aprobada: 'La revisión ya fue aprobada.',
  revision_no_pendiente: 'Esta revisión ya no espera una respuesta.',
  revision_no_editable: 'Solo se puede abrir una versión nueva cuando hay cambios pedidos o la revisión se reabrió.',
  revision_no_aprobada: 'Solo se puede reabrir una revisión aprobada.',
  version_desactualizada: 'Hay una versión más nueva de esta revisión. Recarga la página y revísala.',
  sin_borrador: 'No hay un borrador para publicar o editar.',
  ya_hay_borrador: 'Ya hay una versión nueva en borrador.',
  sin_permiso_aprobar: 'Tu administrador no te ha dado permiso para aprobar. Pídeselo.',
  cambios_requiere_comentario: 'Cuéntanos qué hay que cambiar (mínimo 5 caracteres).',
  terminado_requiere_aprobacion: 'Este hito o sprint solo se da por terminado cuando el cliente aprueba su revisión.',
  sprint_no_revisable: 'El sprint aún es una propuesta: aprueba el plan antes de revisarlo.',
  sprint_ya_terminado: 'Ese sprint ya está terminado.',
  hito_ya_terminado: 'El hito de diseño ya está terminado. Reábrelo antes de publicar otra revisión.',
  enlace_invalido: 'El enlace debe empezar por https:// y no tener espacios.',
  acta_invalida: 'El acta debe ser un documento de la categoría "acta" de la misma empresa.',
  // Documentos y archivos
  documento_no_encontrado: 'No encontramos ese documento.',
  miembro_invalido: 'Solo se puede compartir con personas activas de esa empresa.',
  archivo_no_encontrado: 'No encontramos ese archivo.',
  archivo_ya_recibido: 'Websourcing ya recibió este archivo y quedó fijo: no se puede borrar.',
  // Subidas
  reserva_invalida: 'La subida no es válida o ya se usó. Intenta subir el archivo de nuevo.',
  reserva_vencida: 'La subida venció. Intenta subir el archivo de nuevo.',
  archivo_no_subido: 'El archivo no llegó completo. Intenta subirlo de nuevo.',
  archivo_demasiado_grande: 'El archivo es muy pesado: el máximo es 50 MB (10 MB para capturas).',
  tipo_no_permitido: 'Ese tipo de archivo no está permitido. Usa imágenes, PDF, video, audio, Office (sin macros), CSV o ZIP.',
  demasiadas_subidas: 'Hiciste muchas subidas seguidas. Espera un rato e intenta de nuevo.',
};

export function codigoDeErrorRevDocs(error: { message?: string } | null | undefined): string | null {
  const texto = error?.message?.trim();
  if (!texto) return null;
  const codigo = texto.split(':')[0].trim();
  return codigo in MENSAJES ? codigo : codigoDeError(error);
}

/** Mensaje para la persona. Si el código no es de este sprint, lo resuelve `errores.ts` (o el genérico). */
export function mensajeDeErrorRevDocs(error: { message?: string } | null | undefined): string {
  const texto = error?.message?.trim();
  const codigo = texto ? texto.split(':')[0].trim() : '';
  return codigo in MENSAJES ? MENSAJES[codigo] : mensajeDeError(error);
}
