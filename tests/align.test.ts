import { describe, expect, it } from "vitest";
import { analyzeAlignment, SAMPLE_MARGIN } from "@/lib/align";

const W = 200;
const H = Math.round(W / (85.6 / 54));

/** Imagen sintética: fondo oscuro y un "carnet" claro con texto, desplazado (dx, dy) y escalado. */
function scene(dx = 0, dy = 0, scale = 1, opts: { blur?: boolean } = {}) {
  const g = new Uint8ClampedArray(W * H).fill(50);
  const m = SAMPLE_MARGIN / (1 + 2 * SAMPLE_MARGIN);
  const cw = W * (1 - 2 * m) * scale;
  const ch = H * (1 - 2 * m) * scale;
  const cx0 = Math.round(W / 2 - cw / 2 + dx);
  const cy0 = Math.round(H / 2 - ch / 2 + dy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= cx0 && x < cx0 + cw && y >= cy0 && y < cy0 + ch) {
        // "texto": rayas oscuras dentro del carnet
        const text = !opts.blur && y % 6 < 2 && x > cx0 + cw * 0.4 && x < cx0 + cw * 0.9;
        g[y * W + x] = text ? 40 : 215;
      }
    }
  }
  return g;
}

describe("analyzeAlignment", () => {
  it("detecta un carnet bien encuadrado", () => {
    const r = analyzeAlignment(scene(), W, H);
    expect(r.aligned).toBe(true);
    expect(Math.min(...r.scores)).toBeGreaterThan(0.9);
  });

  it("tolera un pequeño desplazamiento", () => {
    expect(analyzeAlignment(scene(3, 2), W, H).aligned).toBe(true);
  });

  it("rechaza un carnet corrido hacia un lado", () => {
    expect(analyzeAlignment(scene(30, 0), W, H).aligned).toBe(false);
  });

  it("rechaza un carnet muy lejos o muy cerca", () => {
    expect(analyzeAlignment(scene(0, 0, 0.7), W, H).aligned).toBe(false);
    expect(analyzeAlignment(scene(0, 0, 1.35), W, H).aligned).toBe(false);
  });

  it("rechaza una imagen sin carnet", () => {
    const r = analyzeAlignment(new Uint8ClampedArray(W * H).fill(120), W, H);
    expect(r.aligned).toBe(false);
    expect(r.sharpness).toBe(0);
  });

  it("mide la nitidez del interior", () => {
    expect(analyzeAlignment(scene(), W, H).sharpness).toBeGreaterThan(analyzeAlignment(scene(0, 0, 1, { blur: true }), W, H).sharpness);
  });
});

import { FLIP_DIFF, signature, signatureDiff } from "@/lib/align";

describe("signature", () => {
  /** Lado A: foto a la izquierda. Lado B: bloque de texto abajo (como la MRZ). */
  function side(kind: "A" | "B", shift = 0, light = 0) {
    const g = new Uint8ClampedArray(W * H).fill(200 + light);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const xx = x - shift;
        const dark =
          kind === "A" ? xx > 20 && xx < 70 && y > 25 && y < 95 : y > 85 && y < 115 && xx > 15 && xx < 185 && y % 6 < 3;
        if (dark) g[y * W + x] = 60 + light;
      }
    return signature(g, W, H);
  }

  it("el mismo lado con un pequeño movimiento o cambio de luz se parece", () => {
    expect(signatureDiff(side("A"), side("A", 3))).toBeLessThan(FLIP_DIFF);
    expect(signatureDiff(side("A"), side("A", 0, 30))).toBeLessThan(FLIP_DIFF);
  });

  it("el otro lado del carnet es distinto", () => {
    expect(signatureDiff(side("A"), side("B"))).toBeGreaterThan(FLIP_DIFF);
  });
});
