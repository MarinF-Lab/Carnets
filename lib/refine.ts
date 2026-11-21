/**
 * Recorte fino: después de capturar, busca los bordes reales del carnet dentro de la
 * foto y recorta un poco hacia adentro para que no se vea el fondo.
 */

export type Edges = { top: number | null; bottom: number | null; left: number | null; right: number | null };

/** Fracción exterior de la imagen donde se busca cada borde. */
const BAND = 0.18;
/** Cambio de luz mínimo (0–255) para que un píxel cuente como borde. */
const EDGE_T = 20;
/** Fracción mínima del lado que debe ser borde (el texto tiene huecos; el borde es continuo). */
const MIN_CONT = 0.55;

/**
 * Detecta la posición (en píxeles de la imagen gris w×h) de cada borde del carnet.
 * Para cada lado mide, en cada fila/columna de la franja exterior, qué fracción del
 * lado tiene un cambio de luz fuerte, y elige la línea más externa que sea un borde continuo.
 * Devuelve null en los lados donde no hay un borde claro.
 */
export function detectCardEdges(gray: Uint8ClampedArray | Uint8Array, w: number, h: number): Edges {
  const at = (x: number, y: number) => gray[y * w + x];

  // Continuidad del borde horizontal en la fila y (en el 80 % central).
  const rowScore = (y: number) => {
    let n = 0;
    const x0 = Math.round(w * 0.1);
    const x1 = Math.round(w * 0.9);
    for (let x = x0; x < x1; x++) if (Math.abs(at(x, y + 1) - at(x, y - 1)) >= EDGE_T) n++;
    return n / (x1 - x0);
  };
  const colScore = (x: number) => {
    let n = 0;
    const y0 = Math.round(h * 0.1);
    const y1 = Math.round(h * 0.9);
    for (let y = y0; y < y1; y++) if (Math.abs(at(x + 1, y) - at(x - 1, y)) >= EDGE_T) n++;
    return n / (y1 - y0);
  };

  /** Recorre de afuera hacia adentro y devuelve la línea más externa con borde fuerte. */
  const find = (positions: number[], score: (p: number) => number): number | null => {
    const scores = positions.map(score);
    const peak = Math.max(...scores);
    if (!(peak >= MIN_CONT)) return null;
    const limit = Math.max(MIN_CONT, peak * 0.7);
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] >= limit) {
        // Afinar: el máximo local alrededor de esa línea.
        let best = i;
        for (let j = i + 1; j < Math.min(scores.length, i + 4); j++) if (scores[j] > scores[best]) best = j;
        return positions[best];
      }
    }
    return null;
  };

  const by = Math.max(3, Math.round(h * BAND));
  const bx = Math.max(3, Math.round(w * BAND));
  const range = (a: number, b: number, step: number) => {
    const out: number[] = [];
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) out.push(i);
    return out;
  };

  return {
    top: find(range(1, by, 1), rowScore),
    bottom: find(range(h - 2, h - 1 - by, -1), rowScore),
    left: find(range(1, bx, 1), colScore),
    right: find(range(w - 2, w - 1 - bx, -1), colScore),
  };
}

/**
 * Recorte hacia adentro del borde detectado y recorte fijo si no se detecta,
 * como fracción del ANCHO (la misma distancia en mm arriba, abajo y a los lados).
 */
const INSET = 0.005;
const FALLBACK = 0.01;
/** Radio de las esquinas del carnet (3,2 mm sobre 85,6 mm de ancho). */
const CORNER = 0.037;

export type CropBox = { x0: number; y0: number; x1: number; y1: number };

/** Calcula el recorte (en fracciones 0–1) a partir de los bordes detectados. */
export function cropBox(input: Edges, w: number, h: number): CropBox {
  // Un par de bordes opuestos solo vale si se detectan ambos: si aparece uno solo, lo
  // más probable es que sea algo del interior (la foto del carnet) y no el borde.
  const edges = { ...input };
  if ((edges.left == null) !== (edges.right == null)) edges.left = edges.right = null;
  if ((edges.top == null) !== (edges.bottom == null)) edges.top = edges.bottom = null;
  const k = w / h; // pasar una fracción del ancho a fracción del alto
  // +1 px: el borde detectado es la transición; el carnet empieza justo después.
  let x0 = edges.left != null ? (edges.left + 1) / w + INSET : FALLBACK;
  let x1 = edges.right != null ? (edges.right - 1) / w - INSET : 1 - FALLBACK;
  let y0 = edges.top != null ? (edges.top + 1) / h + INSET * k : FALLBACK * k;
  let y1 = edges.bottom != null ? (edges.bottom - 1) / h - INSET * k : 1 - FALLBACK * k;
  // Sensatez: el carnet debe ocupar la mayor parte y tener una proporción razonable.
  const cw = (x1 - x0) * w;
  const ch = (y1 - y0) * h;
  const ratio = cw / ch;
  if (x1 - x0 < 0.6 || y1 - y0 < 0.6 || ratio < 1.3 || ratio > 1.9) {
    x0 = FALLBACK;
    x1 = 1 - FALLBACK;
    y0 = FALLBACK * k;
    y1 = 1 - FALLBACK * k;
  }
  return { x0, y0, x1, y1 };
}

/** Aplica el recorte fino a una foto del carnet (solo navegador). */
export function refineCrop(src: HTMLCanvasElement): HTMLCanvasElement {
  // Análisis en una copia chica y gris.
  const aw = 400;
  const ah = Math.max(10, Math.round((src.height / src.width) * aw));
  const small = document.createElement("canvas");
  small.width = aw;
  small.height = ah;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(src, 0, 0, aw, ah);
  const rgba = sctx.getImageData(0, 0, aw, ah).data;
  const gray = new Uint8ClampedArray(aw * ah);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;

  const box = cropBox(detectCardEdges(gray, aw, ah), aw, ah);
  const sx = Math.round(box.x0 * src.width);
  const sy = Math.round(box.y0 * src.height);
  const sw = Math.round((box.x1 - box.x0) * src.width);
  const sh = Math.round((box.y1 - box.y0) * src.height);

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  fillCorners(ctx, sw, sh);
  return out;
}

/** Rellena lo que pueda quedar de fondo en las esquinas redondeadas con el color del carnet. */
function fillCorners(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = Math.max(0, (CORNER - INSET) * w);
  if (r < 2) return;
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [w, 0, -1, 1],
    [0, h, 1, -1],
    [w, h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    // Color: promedio de dos puntos del carnet junto a la esquina.
    const p1 = ctx.getImageData(Math.min(w - 1, Math.max(0, cx + dx * r * 1.6)), Math.min(h - 1, Math.max(0, cy + dy * 2)), 1, 1).data;
    const p2 = ctx.getImageData(Math.min(w - 1, Math.max(0, cx + dx * 2)), Math.min(h - 1, Math.max(0, cy + dy * r * 1.6)), 1, 1).data;
    ctx.fillStyle = `rgb(${(p1[0] + p2[0]) >> 1},${(p1[1] + p2[1]) >> 1},${(p1[2] + p2[2]) >> 1})`;
    // Cuña: el cuadrado de la esquina menos el cuarto de círculo.
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * r, cy);
    ctx.arc(cx + dx * r, cy + dy * r, r, dy > 0 ? (dx > 0 ? Math.PI * 1.5 : Math.PI * 1.5) : Math.PI * 0.5, dx > 0 ? Math.PI : 0, (dx > 0) === (dy > 0));
    ctx.closePath();
    ctx.fill();
  }
}
