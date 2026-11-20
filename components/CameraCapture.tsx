"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeAlignment, frameRect, SAMPLE_MARGIN, toGray } from "@/lib/align";
import { cropVideo, fileToCanvas, makeCanvas } from "@/lib/image";
import { useSettings } from "@/lib/settings";
import { CropEditor } from "./CropEditor";
import { btn, Icon, Spinner } from "./ui";

type Props = {
  /** "Lado frontal" o "Lado trasero" */
  title: string;
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
};

type Fit = "searching" | "aligned" | "blurry";

const SAMPLE_W = 200;
const BLUR_LIMIT = 9; // nitidez mínima del interior
const AUTO_MS = 1000; // tiempo encuadrado antes de la captura automática

/** Parte del video que queda bajo un rectángulo del contenedor (video con object-cover). */
function videoRect(v: HTMLVideoElement, cw: number, ch: number, r: { x: number; y: number; w: number; h: number }) {
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  const scale = Math.max(cw / vw, ch / vh);
  const dx = (cw - vw * scale) / 2;
  const dy = (ch - vh * scale) / 2;
  return { sx: (r.x - dx) / scale, sy: (r.y - dy) / scale, sw: r.w / scale, sh: r.h / scale };
}

/** Cámara en vivo a pantalla completa con marco de carnet y respaldo de galería. */
export function CameraCapture({ title, onCapture, onClose }: Props) {
  const { autoCapture } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [flash, setFlash] = useState(false);
  const [frame, setFrame] = useState({ fx: 0, fy: 0, fw: 0, fh: 0 });
  const [fit, setFit] = useState<Fit>("searching");
  const [cropSource, setCropSource] = useState<HTMLCanvasElement | null>(null);

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
    const f = frameRect(el.clientWidth, el.clientHeight);
    const r = videoRect(v, el.clientWidth, el.clientHeight, { x: f.fx, y: f.fy, w: f.fw, h: f.fh });
    const sx = Math.max(0, r.sx);
    const sy = Math.max(0, r.sy);
    const canvas = cropVideo(v, sx, sy, Math.min(v.videoWidth - sx, r.sw), Math.min(v.videoHeight - sy, r.sh));
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    onCapture(canvas);
  }, [onCapture]);

  // Revisión continua del encuadre (~8 veces por segundo).
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);
  useEffect(() => {
    if (status !== "ready" || cropSource) return;
    const sample = makeCanvas(SAMPLE_W, Math.round(SAMPLE_W / (85.6 / 54)));
    const ctx = sample.getContext("2d", { willReadFrequently: true })!;
    let alignedRun = 0;
    let missRun = 0;
    let alignedSince = 0;
    // Tras una captura, esperar a que el carnet salga del marco (para dar vuelta) antes de otra automática.
    let armed = true;
    let lastShot = 0;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      const el = boxRef.current;
      if (!v || !el || !v.videoWidth || document.hidden) return;
      const f = frameRect(el.clientWidth, el.clientHeight);
      const mx = f.fw * SAMPLE_MARGIN;
      const my = f.fh * SAMPLE_MARGIN;
      const r = videoRect(v, el.clientWidth, el.clientHeight, { x: f.fx - mx, y: f.fy - my, w: f.fw + 2 * mx, h: f.fh + 2 * my });
      ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, sample.width, sample.height);
      const gray = toGray(ctx.getImageData(0, 0, sample.width, sample.height).data);
      const res = analyzeAlignment(gray, sample.width, sample.height);

      if (res.aligned) {
        alignedRun++;
        missRun = 0;
      } else {
        missRun++;
        alignedRun = 0;
      }
      const now = performance.now();
      const isAligned = alignedRun >= 2;
      if (missRun >= 3) armed = true;
      if (isAligned) {
        if (!alignedSince) alignedSince = now;
      } else if (missRun >= 2) {
        alignedSince = 0;
      }
      const next: Fit = isAligned ? (res.sharpness < BLUR_LIMIT ? "blurry" : "aligned") : alignedSince ? "aligned" : "searching";
      setFit(next);

      if (autoCapture && armed && next === "aligned" && alignedSince && now - alignedSince >= AUTO_MS && now - lastShot > 1500) {
        armed = false;
        lastShot = now;
        alignedSince = 0;
        captureRef.current();
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [status, cropSource, autoCapture]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    try {
      setCropSource(await fileToCanvas(file));
    } catch {
      alert("No se pudo abrir la imagen.");
    }
  }

  const ok = status === "ready" && fit === "aligned";
  const hint =
    fit === "blurry"
      ? "Imagen borrosa: mantén el celular quieto"
      : fit === "aligned"
        ? autoCapture
          ? "Carnet encuadrado. Capturando…"
          : "Carnet encuadrado"
        : "Ajusta el carnet dentro del marco";

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
            {/* Oscurece fuera del marco; el borde se pone verde al encuadrar */}
            <div
              className={`pointer-events-none absolute rounded-2xl border-[3px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-colors duration-200 ${
                ok ? "border-ok" : fit === "blurry" ? "border-amber-400" : "border-white/90"
              }`}
              style={{ left: frame.fx, top: frame.fy, width: frame.fw, height: frame.fh }}
            />
            <p
              className={`pointer-events-none absolute right-0 left-0 px-6 text-center text-sm font-medium transition-colors ${
                ok ? "text-ok" : fit === "blurry" ? "text-amber-300" : "text-white/85"
              }`}
              style={{ top: frame.fy + frame.fh + 12 }}
              aria-live="polite"
            >
              {hint}
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
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition active:scale-95 disabled:opacity-40 ${
              ok ? "border-ok" : "border-white"
            }`}
          >
            <span className={`h-15 w-15 rounded-full transition-colors ${ok ? "bg-ok" : "bg-white"}`} />
          </button>
          <span className="text-sm font-medium">Capturar</span>
        </div>
        <span />
      </div>
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

      {cropSource && (
        <CropEditor
          source={cropSource}
          title={title}
          onCancel={() => setCropSource(null)}
          onDone={(canvas) => {
            setCropSource(null);
            onCapture(canvas);
          }}
        />
      )}
    </div>
  );
}
