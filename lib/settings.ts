"use client";

/** Preferencias guardadas en este dispositivo. */
import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export type Settings = {
  /** Captura sola cuando el carnet queda encuadrado. */
  autoCapture: boolean;
  /** Lee nombre y RUT automáticamente. */
  autoRead: boolean;
  /** Si la lectura salió completa, guarda solo tras 2 s (con opción de corregir). */
  quickSave: boolean;
  /** Detecta el carnet, lo endereza y deja las esquinas redondeadas. */
  autoFit: boolean;
  theme: Theme;
};

const KEY = "carnets.settings";
const DEFAULTS: Settings = { autoCapture: true, autoRead: true, quickSave: false, autoFit: true, theme: "system" };
/** Versión de las preferencias: al subirla se descartan valores por defecto antiguos. */
const VERSION = 2;
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // v1 tenía el guardado rápido activado por defecto: volver a desactivarlo.
    if ((stored.v ?? 1) < 2) delete stored.quickSave;
    cache = { ...DEFAULTS, ...stored };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, v: VERSION }));
  } catch {
    // sin almacenamiento: queda solo en memoria
  }
  if (patch.theme) applyTheme(patch.theme);
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return typeof window === "undefined" ? DEFAULTS : read();
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
    () => DEFAULTS,
  );
}

/** Script que aplica el tema antes de pintar la página (evita parpadeo). */
export const themeScript = `try{var t=JSON.parse(localStorage.getItem("${KEY}")||"{}").theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
