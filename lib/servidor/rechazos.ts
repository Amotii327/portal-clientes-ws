'use server';
import { crearClienteServidor } from '@/lib/supabase/server';
import { anotarRechazo } from '@/lib/portal/acciones';

/**
 * M-7: cuando una función sensible responde con error, la pantalla avisa aquí (acción de servidor) y el servidor
 * llama aparte a anotar_rechazo con la sesión de la persona. Solo viaja el nombre de la acción y el código.
 * Si no se puede anotar, se ignora: nunca se muestra nada ni se rompe la pantalla.
 */
export async function anotarRechazoServidor(accion: string, codigo: string): Promise<void> {
  try {
    if (!/^[a-z_]{1,60}$/.test(accion) || !/^[a-z_]{1,60}$/.test(codigo)) return;
    const c = await crearClienteServidor();
    await anotarRechazo(c, accion, codigo);
  } catch {
    /* se ignora a propósito */
  }
}
