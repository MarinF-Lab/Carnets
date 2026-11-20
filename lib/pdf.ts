/** PDF del carnet (sección 7): se genera al momento y no se guarda. */
import type { Card, CardImages } from "./db";
import { formatDate } from "./text";

/** "Nombre Apellido - Contratista.pdf", sin \ / : * ? " < > | */
export function pdfFileName(cardName: string, contractorName: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const base = [clean(cardName) || "Carnet", clean(contractorName)].filter(Boolean).join(" - ");
  return `${base}.pdf`;
}

export function zipFileName(contractorName: string): string {
  const clean = contractorName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${clean || "Contratista"}.zip`;
}

/** Agrega (2), (3)… si el nombre ya se usó. */
export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

export async function buildPdf(
  card: Pick<Card, "name" | "rut" | "createdAt">,
  images: CardImages,
  contractorName: string,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = 210;
  const H = 297;
  const M = 15;
  const contentW = W - 2 * M;

  pdf.setProperties({ title: card.name, subject: `Carnet - ${contractorName}` });

  // Encabezado
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(pdf.splitTextToSize(card.name, contentW)[0] ?? "", M, M + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  const meta = `Contratista: ${contractorName} · RUT: ${card.rut ?? "—"} · Fecha: ${formatDate(card.createdAt)}`;
  pdf.text(pdf.splitTextToSize(meta, contentW)[0] ?? "", M, M + 12);
  pdf.setDrawColor(200);
  pdf.line(M, M + 16, W - M, M + 16);

  // Frontal arriba, trasero abajo
  const top = M + 22;
  const halfH = (H - M - top) / 2;
  const sides: [string, string][] = [
    ["Lado frontal", images.front],
    ["Lado trasero", images.back],
  ];
  sides.forEach(([label, data], i) => {
    const y0 = top + i * halfH;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(60);
    pdf.text(label, M, y0 + 4);
    if (!data) return;
    const props = pdf.getImageProperties(data);
    const boxW = contentW;
    const boxH = halfH - 12;
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    pdf.addImage(data, "JPEG", M + (boxW - w) / 2, y0 + 7, w, h, undefined, "FAST");
  });

  return pdf.output("blob");
}

export async function buildZip(
  contractorName: string,
  cards: Card[],
  loadImages: (id: string) => Promise<CardImages | null>,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  onProgress(0, cards.length);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const images = await loadImages(card.id);
    if (images) {
      const blob = await buildPdf(card, images, contractorName);
      zip.file(uniqueName(pdfFileName(card.name, contractorName), used), blob);
    }
    onProgress(i + 1, cards.length);
  }
  return zip.generateAsync({ type: "blob" });
}
