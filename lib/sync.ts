"use client";

/**
 * Escrituras en segundo plano: la app no espera a que el servidor confirme.
 * Aquí se lleva la cuenta de lo pendiente de subir y de los errores.
 */
import { useSyncExternalStore } from "react";

type State = { pending: number; error: string | null };
let state: State = { pending: 0, error: null };
const listeners = new Set<() => void>();
const emit = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

/** Registra una escritura que se completa en segundo plano. */
export function track(write: Promise<unknown>, what: string): void {
  emit({ pending: state.pending + 1 });
  write
    .catch(() => emit({ error: `No se pudo guardar ${what}. Revisa tu conexión o tus permisos.` }))
    .finally(() => emit({ pending: Math.max(0, state.pending - 1) }));
}

export function pendingWrites(): number {
  return state.pending;
}

export function clearSyncError() {
  emit({ error: null });
}

export function useSync(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
