import * as React from 'react';
import { cn } from '@/lib/utils';

/** Tabla con scroll lateral dentro de su caja (la página nunca se desborda en celular). */
export const Table = ({ className, ...p }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="scroll-x relative rounded-lg border border-border">
    <table className={cn('w-full min-w-[40rem] border-collapse text-sm', className)} {...p} />
  </div>
);
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-border" {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('hover:bg-surface-2/50', className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cn('px-4 py-3 font-medium', className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;
