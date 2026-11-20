"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { btn, input, Spinner } from "./ui";

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl">
        {children}
      </div>
    </div>
  );
}

/** Diálogo de confirmación (por ejemplo, antes de eliminar). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError("No se pudo completar la acción. Inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-2 text-muted">{message}</div>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className={danger ? btn.primary : btn.dark} onClick={confirm} disabled={busy}>
          {busy ? <Spinner /> : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

/** Diálogo con un campo de texto (nuevo contratista, renombrar). */
export function PromptDialog({
  title,
  label,
  initialValue = "",
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit}>
        <h2 className="text-xl font-bold">{title}</h2>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
          <input ref={ref} className={input} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
        </label>
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !value.trim()}>
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Diálogo de progreso no cancelable (ZIP). */
export function ProgressDialog({ title, done, total }: { title: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Sheet onClose={() => {}}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-muted" aria-live="polite">
        {done < total ? `${done + 1} de ${total}…` : "Empaquetando…"}
      </p>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </Sheet>
  );
}
