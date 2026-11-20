'use client';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';

/** Cambia entre Clara y Oscura. El guardado en preferencias_usuario lo hace el proveedor de la zona privada. */
export function BotonTema() {
  const { tema, setTema } = useStore();
  const oscuro = tema === 'oscuro';
  return (
    <Button variant="ghost" size="icon" aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={oscuro ? 'Tema claro' : 'Tema oscuro'} onClick={() => setTema(oscuro ? 'claro' : 'oscuro')}>
      {oscuro ? <Sun /> : <Moon />}
    </Button>
  );
}
