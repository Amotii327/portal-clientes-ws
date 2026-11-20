import { crearClienteNavegador } from '@/lib/supabase/client';

/** Cierra la sesión y vuelve a la pantalla de entrar (recarga completa para limpiar todo lo que había en memoria). */
export async function cerrarSesion() {
  try {
    await crearClienteNavegador().auth.signOut();
  } finally {
    window.location.assign('/entrar?salir=1');
  }
}
