"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_RATIO, cropVideo, fileToCanvas } from "@/lib/image";
import { btn, Icon, Spinner } from "./ui";

type Props = {
  /** "Lado frontal" o "Lado trasero" */
  title: string;
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
};

/** Marco del carnet dentro del contenedor (90 % del ancho, o del alto si no cabe). */
function frameRect(cw: number, ch: number) {
  let fw = cw * 0.9;
  let fh = fw / CARD_RATIO;
  if (fh > ch * 0.8) {
    fh = ch * 0.8;
    fw = fh * CARD_RATIO;
  }
  return { fx: (cw - fw) / 2, fy: (ch - fh) / 2, fw, fh };
}

/** Cámara en vivo a pantalla completa con marco de carnet y respaldo de galería. */
export function CameraCapture({ title, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [flash, setFlash] = useState(false);
  const [frame, setFrame] = useState({ fx: 0, fy: 0, fw: 0, fh: 0 });

  // Iniciar cámara trasera.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Sin cámara");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) return;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Recalcular el marco al cambiar el tamaño.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setFrame(frameRect(el.clientWidth, el.clientHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const capture = useCallback(() => {
    const v = videoRef.current;
    const el = boxRef.current;
    if (!v || !el || !v.videoWidth) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    // El video se muestra con object-cover: calcular qué parte del video queda bajo el marco.
    const scale = Math.max(cw / vw, ch / vh);
    const dx = (cw - vw * scale) / 2;
    const dy = (ch - vh * scale) / 2;
    const { fx, fy, fw, fh } = frameRect(cw, ch);
    const sx = Math.max(0, (fx - dx) / scale);
    const sy = Math.max(0, (fy - dy) / scale);
    const sw = Math.min(vw - sx, fw / scale);
    const sh = Math.min(vh - sy, fh / scale);
    const canvas = cropVideo(v, sx, sy, sw, sh);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    onCapture(canvas);
  }, [onCapture]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    try {
      onCapture(await fileToCanvas(file));
    } catch {
      alert("No se pudo abrir la imagen.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} className={`${btn.ghost} text-white`} aria-label="Cerrar cámara">
          <Icon.close />
        </button>
        <p className="text-lg font-semibold">{title}</p>
        <span className="w-11" />
      </div>

      <div ref={boxRef} className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        {status === "ready" && (
          <>
            {/* Oscurece fuera del marco */}
            <div
              className="pointer-events-none absolute rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{ left: frame.fx, top: frame.fy, width: frame.fw, height: frame.fh }}
            />
            <p
              className="pointer-events-none absolute right-0 left-0 text-center text-sm text-white/85"
              style={{ top: frame.fy + frame.fh + 12 }}
            >
              Ajusta el carnet dentro del marco
            </p>
          </>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Icon.camera width={40} height={40} />
            <p className="text-lg font-semibold">No se pudo abrir la cámara</p>
            <p className="text-white/75">Revisa el permiso de cámara del navegador o elige una foto de la galería.</p>
          </div>
        )}

        {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}
      </div>

      <div className="grid grid-cols-3 items-center px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`${btn.ghost} flex-col gap-0.5 text-xs text-white`}
        >
          <Icon.image />
          Elegir de galería
        </button>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={capture}
            disabled={status !== "ready"}
            aria-label="Capturar"
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition active:scale-95 disabled:opacity-40"
          >
            <span className="h-15 w-15 rounded-full bg-white" />
          </button>
          <span className="text-sm font-medium">Capturar</span>
        </div>
        <span />
      </div>
      <p className="sr-only" aria-live="polite">
        {status === "ready" ? "Cámara lista. Botón Capturar." : ""}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
