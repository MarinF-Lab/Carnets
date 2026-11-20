/** Quita tildes y pasa a minúsculas, para buscar sin importar acentos. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "JUAN ANDRÉS" → "Juan Andrés" */
export function titleCase(s: string): string {
  return s
    .toLocaleLowerCase("es-CL")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("es-CL") + w.slice(1))
    .join(" ");
}

/** Fecha como dd-mm-aaaa. */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
