'use client';
import * as React from 'react';
import { RotateCcw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { Pantalla } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Revision } from '@/lib/data';
import { fechaHora } from '@/lib/utils';

export function Aprobaciones() {
  const s = useStore();
  const [f, setF] = React.useState('todas');
  const [reabrir, setReabrir] = React.useState<{ eid: string; r: Revision } | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const todas = s.empresas.filter((e) => f === 'todas' || e.id === f).flatMap((e) => e.revisiones.map((r) => ({ e, r })));
  const Col = ({ titulo, estado, vacio, nota }: { titulo: string; estado: Revision['estado']; vacio: string; nota: string }) => {
    const items = todas.filter(({ r }) => r.estado === estado);
    return (
      <section aria-label={titulo} className="min-w-0">
        <div className="mb-1 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">{titulo}</h2><Badge>{items.length}</Badge></div>
        <p className="mb-3 text-xs text-muted-foreground">{nota}</p>
        <div className="space-y-3">
          {items.length === 0 && <Card className="p-5 text-sm text-muted-foreground">{vacio}</Card>}
          {items.map(({ e, r }) => (
            <Card key={r.id} className="p-4">
              <p className="text-xs text-muted-foreground">{e.nombre} · {e.proyectos.find((p) => p.id === r.proyectoId)?.nombre}</p>
              <p className="mt-0.5 font-medium">{r.titulo} <span className="text-muted-foreground">v{r.version}</span></p>
              {r.decision && <p className="mt-2 text-sm text-muted-foreground">{r.decision.quien} · {fechaHora(r.decision.cuando)}<br />“{r.decision.comentario}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {estado === 'borrador' && <Button size="sm" onClick={() => { s.mutar(e.id, (x) => { const y = x.revisiones.find((z) => z.id === r.id)!; y.estado = 'publicada'; y.publicada = '2026-11-20'; x.proyectos.find((z) => z.id === y.proyectoId)!.historial.unshift({ cuando: '2026-11-20', texto: `${y.titulo} publicado para tu aprobación.` }); }, `Publicó la revisión "${r.titulo}"`); s.avisar('Publicada. Se avisó por correo a quienes pueden aprobar.'); }}><Send />Marcar lista y publicar</Button>}
                {estado === 'cambios_pedidos' && <Button size="sm" variant="secondary" asChild><Enlace to={`/admin/proyectos/${e.id}/${r.proyectoId}`}>Abrir proyecto</Enlace></Button>}
                {estado === 'aprobada' && <Button size="sm" variant="outline" onClick={() => setReabrir({ eid: e.id, r })}><RotateCcw />Reabrir</Button>}
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  };
  return (
    <>
      <PageHeader titulo="Bandeja de aprobaciones" descripcion="Qué espera tu revisión, qué pidió cambiar cada cliente y qué ya aprobó. Tú no puedes aprobar por el cliente." acciones={<div className="w-56"><Select aria-label="Filtrar por cliente" value={f} onChange={(e) => setF(e.target.value)}><option value="todas">Todos los clientes</option>{s.empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select></div>} />
      <Pantalla vacio={{ titulo: 'Bandeja vacía', texto: 'No hay revisiones por ahora.' }}>
        <div className="grid gap-6 lg:grid-cols-3">
          <Col titulo="Esperando tu revisión" estado="borrador" vacio="Nada por publicar." nota="Pasaron QA y falta tu visto bueno para publicarlas al cliente." />
          <Col titulo="Cambios pedidos" estado="cambios_pedidos" vacio="Ningún cambio pendiente." nota="El cliente pidió ajustes. Quedan abiertos para ti." />
          <Col titulo="Aprobado" estado="aprobada" vacio="Aún no hay aprobaciones." nota="Quedan registradas con quién, cuándo y qué versión." />
        </div>
        <div className="mt-8"><Col titulo="Publicadas, esperando al cliente" estado="publicada" vacio="Ninguna." nota="Ya las puede ver el cliente." /></div>
      </Pantalla>
      <Dialog open={!!reabrir} onOpenChange={(o) => !o && setReabrir(null)}>
        {reabrir && (
          <DialogContent title={`Reabrir: ${reabrir.r.titulo}`} description="Solo tú puedes reabrir una revisión aprobada. Queda en el historial.">
            <div className="space-y-4">
              <Field label="Motivo" htmlFor="re-motivo"><Textarea id="re-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
              <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button disabled={motivo.trim().length < 5} onClick={() => { s.mutar(reabrir.eid, (x) => { x.revisiones.find((z) => z.id === reabrir.r.id)!.estado = 'publicada'; }, `Reabrió la revisión "${reabrir.r.titulo}" (motivo: ${motivo})`); s.avisar('Revisión reabierta. Queda en el historial.'); setReabrir(null); setMotivo(''); }}>Reabrir</Button></div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
