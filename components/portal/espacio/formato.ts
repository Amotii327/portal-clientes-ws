/** Tamaños para mostrar (es-CO). La pantalla nunca calcula el estado del espacio: viene de la base. */
const MB = 1024 * 1024;
const GB = 1024 * MB;
export function tamanoEspacio(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1).replace('.', ',')} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1).replace('.', ',')} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}
export const BYTES_POR_MB = MB;
export const BYTES_POR_GB = GB;
export const CUPO_MIN = 10 * MB;
export const CUPO_MAX = 1024 * GB;
