/** Utilidades de imagen (solo navegador). */

export { CARD_RATIO } from "./align";

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas no disponible");
  return ctx;
}

/** Gira la imagen 90° en sentido horario. */
export function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(src.height, src.width);
  const ctx = ctx2d(out);
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Escala para que el lado mayor no supere maxSide. */
export function resize(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale === 1) return src;
  const out = makeCanvas(src.width * scale, src.height * scale);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export function toJpeg(src: HTMLCanvasElement, quality: number): string {
  return src.toDataURL("image/jpeg", quality);
}

/** Carga un archivo de imagen (galería) en un canvas, limitado a 2400 px. */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const c = makeCanvas(bitmap.width * scale, bitmap.height * scale);
  ctx2d(c).drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}

/** Recorta una región del video en su resolución nativa. */
export function cropVideo(
  video: HTMLVideoElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): HTMLCanvasElement {
  const c = makeCanvas(sw, sh);
  ctx2d(c).drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Copia en escala de grises con más contraste, para el OCR. */
export function preprocessForOcr(src: HTMLCanvasElement, region?: { y0: number; y1: number }): HTMLCanvasElement {
  const y0 = Math.round((region?.y0 ?? 0) * src.height);
  const y1 = Math.round((region?.y1 ?? 1) * src.height);
  // Tesseract funciona mejor con texto de buen tamaño: lado mayor ~2000 px.
  const scale = Math.min(2, 2000 / Math.max(src.width, y1 - y0));
  const out = makeCanvas(src.width * scale, (y1 - y0) * scale);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, y0, src.width, y1 - y0, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const contrast = 1.6;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * contrast + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

const MAX_BYTES = 900_000;

/**
 * Comprime ambos lados para que juntos pesen menos de 900 KB
 * (Firestore admite máximo 1 MiB por documento).
 */
export function compressPair(front: HTMLCanvasElement, back: HTMLCanvasElement): { front: string; back: string } {
  for (const maxSide of [1400, 1200, 1000, 800]) {
    const f = resize(front, maxSide);
    const b = resize(back, maxSide);
    for (let q = 0.75; q >= 0.5 - 1e-9; q -= 0.05) {
      const fj = toJpeg(f, q);
      const bj = toJpeg(b, q);
      if (fj.length + bj.length <= MAX_BYTES) return { front: fj, back: bj };
    }
  }
  throw new Error("Las fotos son demasiado pesadas para guardarlas.");
}

/** Miniatura del frontal: 240 px, ~15 KB. */
export function makeThumb(front: HTMLCanvasElement): string {
  return toJpeg(resize(front, 240), 0.7);
}

/** Dimensiones de una imagen en data URL. */
export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = dataUrl;
  });
}
