"use client";

import { useEffect, useState } from "react";
import { clearSyncError, useSync } from "@/lib/sync";
import { Icon } from "./ui";

/** Indicador de cambios pendientes de subir y avisos de error. */
export function SyncStatus() {
  const { pending, error } = useSync();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      {(pending > 0 || !online) && (
        <div
          className="sync-pill pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink/90 px-3 py-1 text-xs font-medium text-paper shadow"
          aria-live="polite"
        >
          {!online
            ? pending > 0
              ? `Sin conexión · ${pending} por subir`
              : "Sin conexión"
            : `Subiendo ${pending}…`}
        </div>
      )}
      {error && (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-accent px-4 py-3 text-white shadow-lg" role="alert">
          <p className="flex-1 text-sm">{error}</p>
          <button type="button" onClick={clearSyncError} aria-label="Cerrar aviso" className="-m-1 p-1">
            <Icon.close width={18} height={18} />
          </button>
        </div>
      )}
    </>
  );
}
