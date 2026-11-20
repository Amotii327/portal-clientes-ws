import { Alert } from '@/components/ui/alert';

/** Aviso fijo de las pantallas que todavía son prototipo con datos de ejemplo. */
export function ProximoSprint() {
  return (
    <Alert variant="info" className="mb-6" title="Disponible en el próximo sprint">
      Esta pantalla todavía es una muestra: todo lo que ves son datos de ejemplo y lo que hagas aquí no se guarda.
    </Alert>
  );
}
