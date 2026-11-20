import { titleCase } from "./text";

/**
 * Lee el nombre desde la zona MRZ del reverso del carnet chileno.
 * La línea 3 tiene el formato APELLIDO1<APELLIDO2<<NOMBRE1<NOMBRE2<<<<
 * Devuelve "Nombres Apellidos" o null.
 */
export function nameFromMrz(text: string): string | null {
  const lines = text
    .toUpperCase()
    .replace(/[«‹]/g, "<<")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 10);

  // La línea del nombre: solo letras y '<', con un separador '<<' entre letras.
  const candidates = lines.filter((l) => /^[A-Z<]+$/.test(l) && /[A-Z]<<[A-Z]/.test(l));
  const line = candidates[candidates.length - 1];
  if (!line) return null;

  const trimmed = line.replace(/^<+/, "").replace(/<+$/, "");
  const sep = trimmed.indexOf("<<");
  if (sep <= 0) return null;

  const surnames = trimmed.slice(0, sep).split("<").filter(Boolean);
  const names = trimmed
    .slice(sep + 2)
    .split("<")
    .filter((w) => w.length > 1 || /^[A-Z]$/.test(w))
    .filter(Boolean);
  if (surnames.length === 0 || names.length === 0) return null;

  return titleCase([...names, ...surnames].join(" "));
}

const STOP_LABELS = /NACIONALIDAD|SEXO|FECHA|NUMERO|NÚMERO|DOCUMENTO|RUN\b|FIRMA|EMISI|VENCIMIENTO|CHILE/;

function cleanNameLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÜÑ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lee el nombre desde el OCR del frontal: el texto bajo las etiquetas
 * APELLIDOS y NOMBRES. Devuelve "Nombres Apellidos" o null.
 */
export function nameFromFront(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const upper = lines.map((l) => l.toUpperCase());

  const iA = upper.findIndex((l) => /APELLIDOS?/.test(l));
  const iN = upper.findIndex((l, i) => i > iA && /NOMBRES?/.test(l));
  if (iA < 0 || iN < 0) return null;

  const collect = (from: number, to: number, label: RegExp): string => {
    const parts: string[] = [];
    // El valor puede venir en la misma línea que la etiqueta.
    const sameLine = cleanNameLine(lines[from].toUpperCase().replace(label, ""));
    if (sameLine.length > 1) parts.push(sameLine);
    for (let i = from + 1; i < to; i++) {
      if (STOP_LABELS.test(upper[i])) break;
      const c = cleanNameLine(lines[i]);
      if (c.length > 1) parts.push(c);
    }
    return parts.join(" ").trim();
  };

  const surnames = collect(iA, iN, /APELLIDOS?/);
  let end = iN + 1;
  while (end < lines.length && !STOP_LABELS.test(upper[end]) && end - iN <= 2) end++;
  const names = collect(iN, end, /NOMBRES?/);

  if (!surnames || !names) return null;
  // Descarta lecturas con palabras de una sola letra (ruido típico del OCR).
  const words = `${names} ${surnames}`.split(" ").filter((w) => w.length > 1);
  if (words.length < 2) return null;
  return titleCase(`${names} ${surnames}`.split(" ").filter((w) => w.length > 1).join(" "));
}
