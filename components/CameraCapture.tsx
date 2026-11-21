"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { analyzeAlignment, frameRect as baseFrameRect, SAMPLE_MARGIN, toGray } from "@/lib/align";
import { focusAt, openBackCamera, setZoom, type CameraInfo } from "@/lib/camera";
import { cropVideo, fileToCanvas, makeCanvas } from "@/lib/image";
import { useSettings } from "@/lib/settings";
import { useSync } from "@/lib/sync";
import { CropEditor } from "./CropEditor";
import { btn, Icon, Spinner } from "./ui";

type Props = {
  /** "Lado frontal" o "Lado trasero" */
  title: string;
  /** Texto secundario bajo el título (p. ej. "3 guardados"). */
  subtitle?: string;
  /**
   * Empezar sin captura automática hasta que el carnet salga del marco
   * (al seguir con el siguiente carnet, para no capturar el anterior).
   */
  startDisarmed?: boolean;
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
};

type Fit = "searching" | "aligned" | "blurry";

const SAMPLE_W = 200;
/** Marco más chico que la pantalla: obliga a alejar el celular a una distancia en que enfoca. */
const CAMERA_FILL = 0.72;
const frameRect = (cw: number, ch: number) => baseFrameRect(cw, ch, CAMERA_FILL);
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
export function CameraCapture({ title, subtitle, startDisarmed = false, onCapture, onClose }: Props) {
  const { autoCapture } = useSettings();
  const { pending } = useSync();

  // Marcar que la cámara está abierta (oculta el aviso flotante de sincronización).
  useEffect(() => {
    document.body.dataset.camera = "1";
    return () => {
      delete document.body.dataset.camera;
    };
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [flash, setFlash] = useState(false);
  const [frame, setFrame] = useState({ fx: 0, fy: 0, fw: 0, fh: 0 });
  const [fit, setFit] = useState<Fit>("searching");
  const [cropSource, setCropSource] = useState<HTMLCanvasElement | null>(null);
  const [cam, setCam] = useState<CameraInfo | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [zoom, setZoomValue] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; id: number } | null>(null);

  // Iniciar cámara trasera (la principal, con enfoque continuo).
  useEffect(() => {
    let info: CameraInfo | null = null;
    let cancelled = false;
    (async () => {
      try {
        info = await openBackCamera(deviceId);
        if (cancelled) {
          info.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = info.stream;
        await v.play();
        setCam(info);
        setZoomValue(info.zoom ? Math.max(info.zoom.min, 1) : 1);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      info?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  function switchCamera() {
    if (!cam || cam.backCameras.length < 2) return;
    const i = cam.backCameras.findIndex((d) => d.deviceId === cam.deviceId);
    const next = cam.backCameras[(i + 1) % cam.backCameras.length];
    setStatus("starting");
    setDeviceId(next.deviceId);
  }

  // Toque para enfocar (donde el navegador lo permite).
  function onTap(e: PointerEvent<HTMLDivElement>) {
    const v = videoRef.current;
    const el = boxRef.current;
    if (!cam || !v || !el || !v.videoWidth) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    setFocusPoint({ x: px, y: py, id: Date.now() });
    // Pasar del punto en pantalla al punto en el video (object-cover).
    const scale = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
    const dx = (r.width - v.videoWidth * scale) / 2;
    const dy = (r.height - v.videoHeight * scale) / 2;
    const x = Math.min(1, Math.max(0, (px - dx) / scale / v.videoWidth));
    const y = Math.min(1, Math.max(0, (py - dy) / scale / v.videoHeight));
    void focusAt(cam, x, y);
  }

  useEffect(() => {
    if (!focusPoint) return;
    const t = setTimeout(() => setFocusPoint(null), 900);
    return () => clearTimeout(t);
  }, [focusPoint]);

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
    let armed = !startDisarmed;
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
  }, [status, cropSource, autoCapture, startDisarmed]);

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
      ? "Imagen borrosa: aleja un poco el celular y mantenlo quieto"
      : fit === "aligned"
        ? autoCapture
          ? "Carnet encuadrado. Capturando…"
          : "Carnet encuadrado"
        : cam?.canTapFocus
          ? "Ajusta el carnet al marco · toca para enfocar"
          : "Ajusta el carnet dentro del marco";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} className={`${btn.ghost} text-white`} aria-label="Cerrar cámara">
          <Icon.close />
        </button>
        <div className="text-center">
          <p className="text-lg leading-tight font-semibold">{title}</p>
          {(subtitle || pending > 0) && (
            <p className="text-xs text-white/70">
              {[subtitle, pending > 0 ? `${pending} por subir` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {cam && cam.backCameras.length > 1 ? (
          <button type="button" onClick={switchCamera} className={`${btn.ghost} text-white`} aria-label="Cambiar cámara">
            <Icon.switchCamera />
          </button>
        ) : (
          <span className="w-11" />
        )}
      </div>

      <div ref={boxRef} className="relative flex-1 touch-manipulation overflow-hidden" onPointerUp={onTap}>
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

        {focusPoint && (
          <span
            key={focusPoint.id}
            aria-hidden
            className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-[focusRing_0.9s_ease-out_forwards] rounded-full border-2 border-amber-300"
            style={{ left: focusPoint.x, top: focusPoint.y }}
          />
        )}

        {status === "ready" && cam?.zoom && (
          <div className="absolute right-4 bottom-4 left-4 flex items-center gap-3 rounded-full bg-black/45 px-4 py-1 backdrop-blur" onPointerUp={(e) => e.stopPropagation()}>
            <span className="w-10 text-sm font-medium tabular-nums">{zoom.toFixed(1)}×</span>
            <input
              type="range"
              aria-label="Zoom"
              min={cam.zoom.min}
              max={Math.min(cam.zoom.max, 5)}
              step={cam.zoom.step}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoomValue(z);
                void setZoom(cam, z);
              }}
              className="h-11 flex-1 accent-white"
            />
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
