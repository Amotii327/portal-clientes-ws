import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const campo = 'w-full rounded border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 disabled:opacity-50 disabled:cursor-not-allowed aria-[invalid=true]:border-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(campo, 'h-10', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(campo, 'min-h-24 py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('text-sm font-medium text-foreground', className)} {...p} />
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(campo, 'h-10 appearance-none pr-9', className)} {...p}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
  </div>
));
Select.displayName = 'Select';

/** Campo con etiqueta, ayuda y error. */
export function Field({ label, hint, error, children, htmlFor, className }: {
  label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string; className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; id?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input id={id} type="checkbox" disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded border border-border bg-surface-2 checked:border-primary checked:bg-primary" />
        <Check className="pointer-events-none relative size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
      </span>
      <span>{label}</span>
    </label>
  );
}

export const Separator = ({ className }: { className?: string }) => <hr className={cn('border-0 border-t border-border', className)} />;
