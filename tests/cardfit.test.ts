import { describe, expect, it } from "vitest";
import { findCard, fitLine, homography, intersect, project, type Quad } from "@/lib/cardfit";

const W = 480;
const H = 303;

/** Imagen sintética: fondo oscuro y un carnet claro (cuadrilátero) con algo de "texto". */
function scene(q: Quad, bg = 40, card = 215) {
  const g = new Uint8ClampedArray(W * H).fill(bg);
  const inside = (x: number, y: number) => {
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
    }
    return true;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inside(x, y)) {
        const text = y % 9 < 2 && x > 200 && x < 380 && y > 60 && y < 200;
        g[y * W + x] = text ? 70 : card;
      }
  return g;
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 3) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("geometría", () => {
  it("ajusta una recta con ruido y valores atípicos", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 50 + i * 2 + (i % 3) * 0.5 }));
    pts.push({ x: 55, y: 200 }, { x: 120, y: 5 });
    const r = fitLine(pts)!;
    expect(r.inliers).toBeGreaterThanOrEqual(18);
    const p = intersect(r.line, { a: 1, b: 0, c: -100 })!; // x = 100
    expect(Math.abs(p.y - 70)).toBeLessThan(1.5);
  });

  it("la homografía lleva las esquinas del rectángulo al cuadrilátero", () => {
    const q: Quad = [
      { x: 10, y: 20 },
      { x: 400, y: 5 },
      { x: 420, y: 280 },
      { x: 30, y: 300 },
    ];
    const Hm = homography(856, 540, q);
    expect(near(project(Hm, 0, 0), q[0], 0.01)).toBe(true);
    expect(near(project(Hm, 856, 540), q[2], 0.01)).toBe(true);
    expect(near(project(Hm, 0, 540), q[3], 0.01)).toBe(true);
  });
});

describe("findCard", () => {
  it("encuentra un carnet derecho", () => {
    const q: Quad = [
      { x: 16, y: 12 },
      { x: 464, y: 12 },
      { x: 464, y: 293 },
      { x: 16, y: 293 },
    ];
    const f = findCard(scene(q), W, H)!;
    expect(f).not.toBeNull();
    q.forEach((p, i) => expect(near(f[i], p)).toBe(true));
  });

  it("encuentra un carnet girado y en perspectiva", () => {
    const q: Quad = [
      { x: 30, y: 25 },
      { x: 455, y: 8 },
      { x: 468, y: 280 },
      { x: 22, y: 295 },
    ];
    const f = findCard(scene(q), W, H)!;
    expect(f).not.toBeNull();
    q.forEach((p, i) => expect(near(f[i], p, 4)).toBe(true));
  });

  it("no inventa un carnet si no hay contraste", () => {
    const q: Quad = [
      { x: 16, y: 12 },
      { x: 464, y: 12 },
      { x: 464, y: 293 },
      { x: 16, y: 293 },
    ];
    expect(findCard(scene(q, 215, 215), W, H)).toBeNull();
  });

  it("rechaza algo que no tiene forma de carnet", () => {
    const q: Quad = [
      { x: 150, y: 12 },
      { x: 330, y: 12 },
      { x: 330, y: 293 },
      { x: 150, y: 293 },
    ];
    expect(findCard(scene(q), W, H)).toBeNull();
  });
});
