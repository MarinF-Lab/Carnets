/**
 * Detección de encuadre: revisa si los bordes del carnet calzan con el marco.
 * Funciones puras sobre una imagen en escala de grises (testeables sin navegador).
 */

/** Proporción de un carnet: 85,6 × 54 mm. */
export const CARD_RATIO = 85.6 / 54;

/** Marco del carnet dentro de un contenedor (90 % del ancho, o 80 % del alto si no cabe). */
export function frameRect(cw: number, ch: number) {
  let fw = cw * 0.9;
  let fh = fw / CARD_RATIO;
  if (fh > ch * 0.8) {
    fh = ch * 0.8;
    fw = fh * CARD_RATIO;
  }
  return { fx: (cw - fw) / 2, fy: (ch - fh) / 2, fw, fh };
}

/** Margen alrededor del marco que se analiza (fracción del tamaño del marco). */
export const SAMPLE_MARGIN = 0.12;

export type AlignResult = {
  /** Fracción de cada borde donde se ve un borde nítido: arriba, derecha, abajo, izquierda. */
  scores: [number, number, number, number];
  aligned: boolean;
  /** Nitidez media del interior (0–255). Baja = imagen borrosa. */
  sharpness: number;
};

const EDGE_T = 28; // diferencia mínima de luminosidad para considerar un borde
const MIN_SCORE = 0.5;
const MIN_AVG = 0.62;

/**
 * Analiza una muestra en gris de tamaño w×h que incluye el marco con un margen
 * de SAMPLE_MARGIN por lado. Devuelve qué tan bien calzan los 4 bordes.
 */
export function analyzeAlignment(gray: Uint8ClampedArray | Uint8Array, w: number, h: number): AlignResult {
  const m = SAMPLE_MARGIN / (1 + 2 * SAMPLE_MARGIN);
  const x0 = Math.round(w * m);
  const x1 = Math.round(w * (1 - m));
  const y0 = Math.round(h * m);
  const y1 = Math.round(h * (1 - m));
  const bx = Math.max(2, Math.round((x1 - x0) * 0.06)); // tolerancia horizontal
  const by = Math.max(2, Math.round((y1 - y0) * 0.08)); // tolerancia vertical
  const at = (x: number, y: number) => gray[y * w + x];

  // Borde horizontal (arriba/abajo): gradiente vertical en una banda alrededor de y.
  const hEdge = (yc: number) => {
    let strong = 0;
    let total = 0;
    const xa = x0 + Math.round((x1 - x0) * 0.08);
    const xb = x1 - Math.round((x1 - x0) * 0.08);
    for (let x = xa; x < xb; x++) {
      let best = 0;
      for (let y = Math.max(1, yc - by); y <= Math.min(h - 2, yc + by); y++) {
        const g = Math.abs(at(x, y + 1) - at(x, y - 1));
        if (g > best) best = g;
      }
      total++;
      if (best >= EDGE_T) strong++;
    }
    return total ? strong / total : 0;
  };

  // Borde vertical (izquierda/derecha): gradiente horizontal en una banda alrededor de x.
  const vEdge = (xc: number) => {
    let strong = 0;
    let total = 0;
    const ya = y0 + Math.round((y1 - y0) * 0.1);
    const yb = y1 - Math.round((y1 - y0) * 0.1);
    for (let y = ya; y < yb; y++) {
      let best = 0;
      for (let x = Math.max(1, xc - bx); x <= Math.min(w - 2, xc + bx); x++) {
        const g = Math.abs(at(x + 1, y) - at(x - 1, y));
        if (g > best) best = g;
      }
      total++;
      if (best >= EDGE_T) strong++;
    }
    return total ? strong / total : 0;
  };

  const scores: [number, number, number, number] = [hEdge(y0), vEdge(x1), hEdge(y1), vEdge(x0)];

  // Nitidez: gradiente medio en el interior (texto y foto del carnet).
  let sum = 0;
  let n = 0;
  for (let y = y0 + by + 1; y < y1 - by - 1; y += 2) {
    for (let x = x0 + bx + 1; x < x1 - bx - 1; x += 2) {
      sum += Math.max(Math.abs(at(x + 1, y) - at(x - 1, y)), Math.abs(at(x, y + 1) - at(x, y - 1)));
      n++;
    }
  }
  const sharpness = n ? sum / n : 0;

  const avg = scores.reduce((a, b) => a + b, 0) / 4;
  const aligned = scores.every((s) => s >= MIN_SCORE) && avg >= MIN_AVG;
  return { scores, aligned, sharpness };
}

/** Pasa RGBA a gris. */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}
