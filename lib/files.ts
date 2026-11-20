/** Descargar o compartir archivos generados en el navegador. */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Comparte con la Web Share API; si no se puede, descarga. Devuelve false si se canceló. */
export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<boolean> {
  const file = new File([blob], fileName, { type: blob.type || "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return false;
    }
  }
  downloadBlob(blob, fileName);
  return true;
}
