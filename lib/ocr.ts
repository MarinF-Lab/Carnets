/**
 * Lectura automática del carnet (sección 6 de CLAUDE.md).
 * - readFront: se llama apenas se captura el frontal (mientras se da vuelta el carnet).
 * - readBack: MRZ del reverso, solo si al frontal le faltó algo.
 * - readCard(front, back): interfaz combinada.
 * Los archivos del lector se sirven desde el propio sitio (public/tesseract).
 */
import type { Worker } from "tesseract.js";
import { preprocessForOcr } from "./image";
import { nameFromFront, nameFromMrz } from "./mrz";
import { isValidRut, rutFromText } from "./rut";

export type ReadResult = {
  name: string | null;
  rut: string | null;
  rutValid: boolean;
  source: {
    name: "ocr-frontal" | "mrz" | null;
    rut: "ocr-frontal" | "ocr-reverso" | null;
  };
};

const empty = (): ReadResult => ({ name: null, rut: null, rutValid: false, source: { name: null, rut: null } });

let workerPromise: Promise<Worker> | null = null;

/** Carga Tesseract.js (desde el propio sitio) de forma diferida y reutiliza el mismo worker. */
export function preloadOcr(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    return createWorker("spa", OEM.LSTM_ONLY, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
      langPath: "/tesseract/lang",
      gzip: true,
    });
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
async function ocr(canvas: HTMLCanvasElement, mode: "page" | "mrz"): Promise<string> {
  const worker = await preloadOcr();
  await worker.setParameters({
    tessedit_char_whitelist: mode === "mrz" ? MRZ_CHARS : "",
    // page: segmentación automática; mrz: un bloque de texto uniforme.
    tessedit_pageseg_mode: (mode === "page" ? "3" : "6") as never,
  });
  const { data } = await worker.recognize(canvas);
  return data.text ?? "";
}

// Las lecturas se hacen de a una, porque comparten el mismo worker.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Frontal: nombre (APELLIDOS/NOMBRES) y RUN, en una sola lectura a 1600 px. */
export function readFront(front: HTMLCanvasElement): Promise<ReadResult> {
  return serial(async () => {
    const r = empty();
    const text = await ocr(preprocessForOcr(front, undefined, 1600), "page").catch(() => "");
    r.name = nameFromFront(text);
    r.rut = rutFromText(text);
    if (r.name) r.source.name = "ocr-frontal";
    if (r.rut) r.source.rut = "ocr-frontal";
    r.rutValid = r.rut ? isValidRut(r.rut) : false;
    return r;
  });
}

/** Reverso: nombre y RUN desde la MRZ (las 3 líneas con '<'). */
export function readBack(back: HTMLCanvasElement): Promise<ReadResult> {
  return serial(async () => {
    const r = empty();
    const mrzText = await ocr(preprocessForOcr(back, { y0: 0.45, y1: 1 }), "mrz").catch(() => "");
    r.name = nameFromMrz(mrzText);
    if (r.name) r.source.name = "mrz";
    const rut = rutFromText(mrzText.replace(/</g, " "));
    if (rut && isValidRut(rut)) {
      r.rut = rut;
      r.source.rut = "ocr-reverso";
    }
    r.rutValid = r.rut ? isValidRut(r.rut) : false;
    return r;
  });
}

/** Combina: primero el frontal; lo que falte, desde el reverso. */
export function mergeReads(front: ReadResult, back: ReadResult | null): ReadResult {
  const r: ReadResult = { ...front, source: { ...front.source } };
  if (back) {
    if (!r.name && back.name) {
      r.name = back.name;
      r.source.name = back.source.name;
    }
    if ((!r.rut || !r.rutValid) && back.rut && back.rutValid) {
      r.rut = back.rut;
      r.source.rut = back.source.rut;
    }
  }
  r.rutValid = r.rut ? isValidRut(r.rut) : false;
  return r;
}

/** ¿Hace falta leer el reverso? */
export function needsBack(front: ReadResult): boolean {
  return !front.name || !front.rutValid;
}

export async function readCard(front: HTMLCanvasElement, back: HTMLCanvasElement): Promise<ReadResult> {
  const f = await readFront(front);
  return mergeReads(f, needsBack(f) ? await readBack(back) : null);
}
