/**
 * Ajuste automático del carnet: detecta sus 4 bordes (aunque esté algo girado o en
 * perspectiva), lo endereza a un rectángulo exacto de 85,6 × 54 y deja las esquinas
 * redondeadas sobre blanco. Si no lo encuentra con seguridad, devuelve null.
 */

export type Pt = { x: number; y: number };
export type Line = { a: number; b: number; c: number }; // a·x + b·y + c = 0 (normalizada)
export type Quad = [Pt, Pt, Pt, Pt]; // arriba-izq, arriba-der, abajo-der, abajo-izq

const CARD_RATIO = 85.6 / 54;
/** Radio de las esquinas del carnet: 3,18 mm sobre 85,6 mm de ancho. */
export const CORNER_RATIO = 3.18 / 85.6;

/* ---------------- Detección de bordes ---------------- */

/** Suaviza (caja 3×3) para que el texto fino no confunda al detector. */
function blur(g: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
            s += g[yy * w + xx];
            n++;
          }
        }
      out[y * w + x] = s / n;
    }
  return out;
}

/**
 * Busca puntos del borde en un lado: para cada posición a lo largo del lado recorre
 * desde afuera hacia adentro (hasta `depth` de la imagen) y toma el primer cambio
 * de luz fuerte (el borde más externo).
 */
function edgePoints(g: Float32Array, w: number, h: number, side: "top" | "bottom" | "left" | "right", samples = 28, depth = 0.3): Pt[] {
  const pts: Pt[] = [];
  const horizontal = side === "top" || side === "bottom";
  const along = horizontal ? w : h;
  const across = horizontal ? h : w;
  const maxD = Math.round(across * depth);
  const at = (u: number, v: number) => (horizontal ? g[v * w + u] : g[u * w + v]);
  for (let i = 0; i < samples; i++) {
    const u = Math.round(along * (0.12 + (0.76 * i) / (samples - 1)));
    const grads: number[] = [];
    for (let d = 1; d < maxD; d++) {
      const v = side === "top" || side === "left" ? d : across - 1 - d;
      const v1 = side === "top" || side === "left" ? v + 1 : v - 1;
      const v0 = side === "top" || side === "left" ? v - 1 : v + 1;
      grads.push(Math.abs(at(u, v1) - at(u, v0)));
    }
    const peak = Math.max(...grads);
    if (peak < 18) continue;
    const limit = Math.max(18, peak * 0.6);
    let k = grads.findIndex((x) => x >= limit);
    // afinar al máximo local siguiente
    while (k + 1 < grads.length && grads[k + 1] > grads[k]) k++;
    const d = k + 1;
    const v = side === "top" || side === "left" ? d : across - 1 - d;
    pts.push(horizontal ? { x: u, y: v } : { x: v, y: u });
  }
  return pts;
}

/** Recta por dos puntos, normalizada. */
function lineThrough(p: Pt, q: Pt): Line {
  const a = q.y - p.y;
  const b = p.x - q.x;
  const n = Math.hypot(a, b) || 1;
  return { a: a / n, b: b / n, c: -(a * p.x + b * p.y) / n };
}

const dist = (l: Line, p: Pt) => Math.abs(l.a * p.x + l.b * p.y + l.c);

/** Ajuste robusto (RANSAC + mínimos cuadrados con los que calzan). */
export function fitLine(pts: Pt[], tol = 2.5): { line: Line; inliers: number } | null {
  if (pts.length < 6) return null;
  let best: { line: Line; ins: Pt[] } | null = null;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 2; j < pts.length; j += 2) {
      const l = lineThrough(pts[i], pts[j]);
      const ins = pts.filter((p) => dist(l, p) <= tol);
      if (!best || ins.length > best.ins.length) best = { line: l, ins };
    }
  if (!best || best.ins.length < Math.max(6, pts.length * 0.5)) return null;
  // Mínimos cuadrados ortogonales sobre los puntos que calzan.
  const ins = best.ins;
  const mx = ins.reduce((s, p) => s + p.x, 0) / ins.length;
  const my = ins.reduce((s, p) => s + p.y, 0) / ins.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of ins) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // dirección principal
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const a = -dy;
  const b = dx;
  return { line: { a, b, c: -(a * mx + b * my) }, inliers: ins.length };
}

export function intersect(l1: Line, l2: Line): Pt | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (l1.b * l2.c - l2.b * l1.c) / det, y: (l2.a * l1.c - l1.a * l2.c) / det };
}

const len = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** Encuentra las 4 esquinas del carnet en una imagen gris w×h; null si no es seguro. */
export function findCard(gray: Uint8ClampedArray | Uint8Array | Float32Array, w: number, h: number): Quad | null {
  const g = blur(Float32Array.from(gray), w, h);
  const fit = (side: "top" | "bottom" | "left" | "right") => fitLine(edgePoints(g, w, h, side));
  const top = fit("top");
  const bottom = fit("bottom");
  const left = fit("left");
  const right = fit("right");
  if (!top || !bottom || !left || !right) return null;
  const tl = intersect(top.line, left.line);
  const tr = intersect(top.line, right.line);
  const br = intersect(bottom.line, right.line);
  const bl = intersect(bottom.line, left.line);
  if (!tl || !tr || !br || !bl) return null;
  const quad: Quad = [tl, tr, br, bl];
  // Sensatez: dentro de la imagen (con tolerancia), proporción de carnet y tamaño razonable.
  const tol = 0.06;
  if (quad.some((p) => p.x < -w * tol || p.y < -h * tol || p.x > w * (1 + tol) || p.y > h * (1 + tol))) return null;
  const wTop = len(tl, tr);
  const wBot = len(bl, br);
  const hL = len(tl, bl);
  const hR = len(tr, br);
  if (Math.min(wTop, wBot) / Math.max(wTop, wBot) < 0.85) return null;
  if (Math.min(hL, hR) / Math.max(hL, hR) < 0.85) return null;
  const ratio = (wTop + wBot) / (hL + hR);
  if (ratio < 1.35 || ratio > 1.85) return null;
  if (((wTop + wBot) / 2) * ((hL + hR) / 2) < w * h * 0.45) return null;
  return quad;
}

/* ---------------- Perspectiva ---------------- */

/** Homografía que lleva el rectángulo (0,0)-(W,H) al cuadrilátero `q`. */
export function homography(W: number, H: number, q: Quad): number[] {
  // Resolver 8 incógnitas con eliminación gaussiana.
  const src: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function project(H: number[], x: number, y: number): Pt {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
}

/** Achica el cuadrilátero hacia su centro (fracción del ancho) para no incluir el borde. */
function shrink(q: Quad, f: number): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  return q.map((p) => ({ x: p.x + (cx - p.x) * f, y: p.y + (cy - p.y) * f })) as Quad;
}

/* ---------------- En el navegador ---------------- */

/**
 * Endereza el carnet y deja las esquinas redondeadas sobre blanco.
 * Devuelve null si no se detecta el carnet con seguridad (usar la foto tal cual).
 */
export function fitCard(src: HTMLCanvasElement): HTMLCanvasElement | null {
  // 1. Detectar en una copia chica.
  const aw = 480;
  const ah = Math.max(20, Math.round((src.height / src.width) * aw));
  const small = document.createElement("canvas");
  small.width = aw;
  small.height = ah;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(src, 0, 0, aw, ah);
  const rgba = sctx.getImageData(0, 0, aw, ah).data;
  const gray = new Uint8ClampedArray(aw * ah);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  const found = findCard(gray, aw, ah);
  if (!found) return null;

  // 2. Pasar a la resolución original y achicar 0,6 % para no tomar el borde.
  const k = src.width / aw;
  const quad = shrink(found.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad, 0.006);

  // 3. Tamaño de salida: ancho medio del carnet en la foto (máx. 1800 px), proporción exacta.
  const W = Math.min(1800, Math.round((len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2));
  const Hh = Math.round(W / CARD_RATIO);
  const Hm = homography(W, Hh, quad);

  // 4. Enderezar (interpolación bilineal).
  const sctx2 = src.getContext("2d", { willReadFrequently: true })!;
  const sdata = sctx2.getImageData(0, 0, src.width, src.height);
  const s = sdata.data;
  const sw = src.width;
  const sh = src.height;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = Hh;
  const octx = out.getContext("2d")!;
  const odata = octx.createImageData(W, Hh);
  const o = odata.data;
  const r = CORNER_RATIO * W;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const oi = (y * W + x) * 4;
      // Esquinas redondeadas: fuera del arco, blanco.
      const cx = x < r ? r : x > W - 1 - r ? W - 1 - r : x;
      const cy = y < r ? r : y > Hh - 1 - r ? Hh - 1 - r : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) {
        o[oi] = o[oi + 1] = o[oi + 2] = 255;
        o[oi + 3] = 255;
        continue;
      }
      const p = project(Hm, x + 0.5, y + 0.5);
      const px = Math.min(sw - 1.001, Math.max(0, p.x - 0.5));
      const py = Math.min(sh - 1.001, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = s[i00 + ch] * (1 - fx) + s[i10 + ch] * fx;
        const bot = s[i01 + ch] * (1 - fx) + s[i11 + ch] * fx;
        o[oi + ch] = top * (1 - fy) + bot * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

/** Margen extra alrededor del marco que se captura para poder ver los bordes del carnet. */
export const FIT_MARGIN = 0.08;

/**
 * Recibe una foto con margen alrededor del marco (`inner` = el marco dentro de ella).
 * Devuelve el carnet enderezado con esquinas redondeadas o, si no se detecta,
 * el recorte exacto al marco.
 */
export function fitOrCrop(expanded: HTMLCanvasElement, inner: { x: number; y: number; w: number; h: number }, autoFit = true): HTMLCanvasElement {
  if (autoFit) {
    try {
      const fitted = fitCard(expanded);
      if (fitted) return fitted;
    } catch {
      // seguir con el recorte al marco
    }
  }
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(inner.w));
  out.height = Math.max(1, Math.round(inner.h));
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(expanded, inner.x, inner.y, inner.w, inner.h, 0, 0, out.width, out.height);
  return out;
}
