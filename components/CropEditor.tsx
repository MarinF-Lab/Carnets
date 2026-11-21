"use client";

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { frameRect } from "@/lib/align";
import { makeCanvas, rotate90 } from "@/lib/image";
import { btn, Icon } from "./ui";

type View = { scale: number; tx: number; ty: number };

/**
 * Encuadre manual de una foto de la galería: se mueve con un dedo y se acerca
 * con dos (o con el control deslizante). Devuelve solo lo que queda dentro del marco.
 */
export function CropEditor({
  source,
  title,
  margin = 0,
  onDone,
  onCancel,
}: {
  source: HTMLCanvasElement;
  title: string;
  /** Margen extra (fracción del marco) que se entrega alrededor del encuadre. */
  margin?: number;
  /** Entrega la foto con margen y el rectángulo del marco dentro de ella. */
  onDone: (expanded: HTMLCanvasElement, inner: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState(source);
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null);

  // Imagen para mostrar.
  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    img.toBlob(
      (blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      "image/jpeg",
      0.9,
    );
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [img]);

  // Tamaño del área.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = frameRect(box.w, box.h);
  const cover = Math.max(frame.fw / img.width, frame.fh / img.height);
  const minScale = Math.min(frame.fw / img.width, frame.fh / img.height);
  const maxScale = cover * 8;

  // Vista inicial: la foto cubre el marco, centrada.
  const fit = (): View => ({
    scale: cover,
    tx: frame.fx + (frame.fw - img.width * cover) / 2,
    ty: frame.fy + (frame.fh - img.height * cover) / 2,
  });
  const current = view ?? (box.w ? fit() : null);

  function zoomAt(next: number, cx: number, cy: number, base = current) {
    if (!base) return;
    const s = Math.min(maxScale, Math.max(minScale, next));
    setView({ scale: s, tx: cx - ((cx - base.tx) * s) / base.scale, ty: cy - ((cy - base.ty) * s) / base.scale });
  }

  function local(e: PointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = null;
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !current) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      setView({ ...current, tx: current.tx + p.x - prev.x, ty: current.ty + p.y - prev.y });
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!gesture.current) {
        gesture.current = { dist, mid, view: current };
        return;
      }
      const g = gesture.current;
      const s = Math.min(maxScale, Math.max(minScale, (g.view.scale * dist) / g.dist));
      // Zoom alrededor del punto medio inicial + desplazamiento del punto medio.
      setView({
        scale: s,
        tx: mid.x - ((g.mid.x - g.view.tx) * s) / g.view.scale,
        ty: mid.y - ((g.mid.y - g.view.ty) * s) / g.view.scale,
      });
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  }

  function onWheel(e: WheelEvent) {
    if (!current) return;
    const r = boxRef.current!.getBoundingClientRect();
    zoomAt(current.scale * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  function rotate() {
    setImg(rotate90(img));
    setView(null);
  }

  function confirm() {
    if (!current) return;
    const { fx, fy, fw, fh } = frame;
    // Marco + margen alrededor (en la foto original), recortado a los límites de la foto.
    const mx = (fw * margin) / current.scale;
    const my = (fh * margin) / current.scale;
    const fsx = (fx - current.tx) / current.scale;
    const fsy = (fy - current.ty) / current.scale;
    const fsw = fw / current.scale;
    const fsh = fh / current.scale;
    const sx = Math.max(0, fsx - mx);
    const sy = Math.max(0, fsy - my);
    const sw = Math.min(img.width, fsx + fsw + mx) - sx;
    const sh = Math.min(img.height, fsy + fsh + my) - sy;
    // Resolución original, limitada a 2400 px.
    const k = Math.min(1, 2400 / Math.max(sw, sh));
    const out = makeCanvas(sw * k, sh * k);
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
    onDone(out, { x: (fsx - sx) * k, y: (fsy - sy) * k, w: fsw * k, h: fsh * k });
  }

  // Control deslizante logarítmico (0–100).
  const sliderValue = current ? (100 * Math.log(current.scale / minScale)) / Math.log(maxScale / minScale) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onCancel} className={`${btn.ghost} text-white`} aria-label="Cancelar">
          <Icon.close />
        </button>
        <p className="text-lg font-semibold">{title}</p>
        <button type="button" onClick={rotate} className={`${btn.ghost} text-white`} aria-label="Girar 90°">
          <Icon.rotate />
        </button>
      </div>

      <div
        ref={boxRef}
        className="relative flex-1 touch-none overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {url && current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            style={{
              width: img.width,
              height: img.height,
              transform: `translate(${current.tx}px, ${current.ty}px) scale(${current.scale})`,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{ left: frame.fx, top: frame.fy, width: frame.fw, height: frame.fh }}
        />
        <p
          className="pointer-events-none absolute right-0 left-0 px-6 text-center text-sm text-white/85"
          style={{ top: frame.fy + frame.fh + 12 }}
        >
          Mueve y acerca la foto para que el carnet llene el marco
        </p>
      </div>

      <div className="space-y-4 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <label className="flex items-center gap-3">
          <span className="sr-only">Acercar</span>
          <Icon.search className="shrink-0 text-white/70" width={18} height={18} />
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={sliderValue}
            onChange={(e) => {
              const s = minScale * Math.pow(maxScale / minScale, Number(e.target.value) / 100);
              zoomAt(s, frame.fx + frame.fw / 2, frame.fy + frame.fh / 2);
            }}
            className="h-11 w-full accent-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={`${btn.secondary} border-white/30 bg-transparent text-white`} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className={btn.primary} onClick={confirm} disabled={!current}>
            Usar foto
          </button>
        </div>
      </div>
    </div>
  );
}
