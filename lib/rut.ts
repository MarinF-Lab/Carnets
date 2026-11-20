/** Utilidades para el RUT/RUN chileno. */

/** Deja solo dígitos y K: "12.345.678-k" → "12345678K" */
export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Dígito verificador por módulo 11. */
export function computeDv(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return "0";
  if (res === 10) return "K";
  return String(res);
}

/** true si el dígito verificador coincide. */
export function isValidRut(rut: string): boolean {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d{1,9}$/.test(body) || Number(body) === 0) return false;
  return computeDv(body) === dv;
}

/** Formato 12.345.678-5. Si no parece un RUT, devuelve el texto tal cual. */
export function formatRut(rut: string): string {
  const c = cleanRut(rut);
  if (c.length < 2) return rut.trim();
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d+$/.test(body)) return rut.trim();
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

/**
 * Busca un RUN en texto de OCR. Prefiere el primero con dígito verificador
 * válido; si ninguno lo es, devuelve el primero encontrado.
 */
export function rutFromText(text: string): string | null {
  const re = /\d{1,2}\s?\.?\s?\d{3}\s?\.?\s?\d{3}\s?-?\s?[\dkK]\b/g;
  const found = (text.match(re) ?? []).map((m) => formatRut(m));
  if (found.length === 0) return null;
  return found.find(isValidRut) ?? found[0];
}
