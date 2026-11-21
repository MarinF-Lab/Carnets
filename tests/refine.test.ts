import { describe, expect, it } from "vitest";
import { cropBox, detectCardEdges } from "@/lib/refine";

const W = 400;
const H = 252;

/** Foto sintética: fondo y carnet con texto; el carnet ocupa [x0,x1]×[y0,y1]. */
function photo(x0: number, y0: number, x1: number, y1: number, bg = 40, card = 210) {
  const g = new Uint8ClampedArray(W * H).fill(bg);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      // líneas de "texto" cerca del borde superior del carnet, que no deben confundirse con el borde
      const text = (y - y0) % 8 < 2 && y - y0 > 8 && y - y0 < 40 && x > x0 + 120 && x < x0 + 260;
      g[y * W + x] = text ? 60 : card;
    }
  return g;
}

describe("detectCardEdges", () => {
  it("encuentra los cuatro bordes con fondo oscuro", () => {
    const e = detectCardEdges(photo(12, 9, 390, 243), W, H);
    expect(e.left).toBeGreaterThanOrEqual(10);
    expect(e.left).toBeLessThanOrEqual(13);
    expect(e.right).toBeGreaterThanOrEqual(388);
    expect(e.right).toBeLessThanOrEqual(391);
    expect(e.top).toBeGreaterThanOrEqual(7);
    expect(e.top).toBeLessThanOrEqual(10);
    expect(e.bottom).toBeGreaterThanOrEqual(241);
    expect(e.bottom).toBeLessThanOrEqual(244);
  });

  it("no confunde el texto del carnet con el borde", () => {
    const e = detectCardEdges(photo(20, 15, 385, 240), W, H);
    expect(Math.abs((e.top ?? 0) - 15)).toBeLessThanOrEqual(2);
  });

  it("devuelve null si no hay contraste (carnet sobre fondo del mismo color)", () => {
    const e = detectCardEdges(photo(12, 9, 390, 243, 210, 210), W, H);
    expect(e.top).toBeNull();
    expect(e.left).toBeNull();
  });

  it("detecta un carnet corrido hacia un lado", () => {
    const e = detectCardEdges(photo(40, 9, 395, 243), W, H);
    expect(Math.abs((e.left ?? 0) - 40)).toBeLessThanOrEqual(2);
  });
});

describe("cropBox", () => {
  it("recorta hacia adentro del borde detectado", () => {
    const b = cropBox({ top: 9, bottom: 243, left: 12, right: 390 }, W, H);
    expect(b.x0 * W).toBeGreaterThan(12);
    expect(b.x1 * W).toBeLessThan(390);
    expect(b.y0 * H).toBeGreaterThan(9);
    expect(b.y1 * H).toBeLessThan(243);
  });

  it("usa un recorte fijo si no detecta bordes", () => {
    const b = cropBox({ top: null, bottom: null, left: null, right: null }, W, H);
    expect(b.x0).toBeCloseTo(0.025);
    expect(b.x1).toBeCloseTo(0.975);
  });

  it("ignora un borde si el opuesto no se detectó", () => {
    const b = cropBox({ top: 9, bottom: 243, left: 30, right: null }, W, H);
    expect(b.x0).toBeCloseTo(0.025);
    expect(b.y0 * H).toBeGreaterThan(9);
  });

  it("descarta detecciones absurdas", () => {
    const b = cropBox({ top: 100, bottom: 120, left: 12, right: 390 }, W, H);
    expect(b.y0).toBeLessThan(0.1);
  });
});
