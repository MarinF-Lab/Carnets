/**
 * Lectura automática del carnet (sección 6 de CLAUDE.md).
 * Interfaz estable: readCard(front, back) → { name, rut, rutValid, source }.
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

let workerPromise: Promise<Worker> | null = null;

/** Carga Tesseract.js de forma diferida y reutiliza el mismo worker. */
export function preloadOcr(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    return createWorker("spa");
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

async function ocr(canvas: HTMLCanvasElement, mode: "page" | "mrz" = "page"): Promise<string> {
  const worker = await preloadOcr();
  await worker.setParameters({
    tessedit_char_whitelist: mode === "mrz" ? MRZ_CHARS : "",
    // MRZ: un bloque uniforme de texto (PSM 6). Frontal: segmentación automática (PSM 3).
    tessedit_pageseg_mode: (mode === "mrz" ? "6" : "3") as never,
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

export function readCard(front: HTMLCanvasElement, back: HTMLCanvasElement): Promise<ReadResult> {
  return serial(async () => {
    const result: ReadResult = { name: null, rut: null, rutValid: false, source: { name: null, rut: null } };

    // 1. OCR del frontal: nombre y RUT.
    const frontText = await ocr(preprocessForOcr(front)).catch(() => "");
    const frontName = nameFromFront(frontText);
    if (frontName) {
      result.name = frontName;
      result.source.name = "ocr-frontal";
    }
    if (!result.rut) {
      const r = rutFromText(frontText);
      if (r) {
        result.rut = r;
        result.source.rut = "ocr-frontal";
      }
    }

    // 2. MRZ del reverso (parte inferior), si aún falta el nombre o el RUT.
    if (!result.name || !result.rut) {
      const mrzText = await ocr(preprocessForOcr(back, { y0: 0.45, y1: 1 }), "mrz").catch(() => "");
      if (!result.name) {
        const n = nameFromMrz(mrzText);
        if (n) {
          result.name = n;
          result.source.name = "mrz";
        }
      }
      if (!result.rut) {
        const r = rutFromText(mrzText.replace(/</g, " "));
        if (r && isValidRut(r)) {
          result.rut = r;
          result.source.rut = "ocr-reverso";
        }
      }
    }

    result.rutValid = result.rut ? isValidRut(result.rut) : false;
    return result;
  });
}
