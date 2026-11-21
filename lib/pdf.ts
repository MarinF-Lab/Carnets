/** PDF del carnet (sección 7): se genera al momento y no se guarda. */
import type { Card, CardImages } from "./db";
import { mapLimit } from "./pool";
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

/** Tamaño de cada lado en el PDF (mm): algo mayor que el carnet real (85,6 × 54). */
const CARD_W = 96;
const CARD_H = 60.6;
const GAP = 10;

type JsPdf = InstanceType<typeof import("jspdf").jsPDF>;

/** Dibuja una página: encabezado y ambos lados del carnet. */
function drawCardPage(pdf: JsPdf, card: Pick<Card, "rut" | "createdAt">, images: CardImages, contractorName: string) {
  const W = 210;
  const M = 15;
  const contentW = W - 2 * M;
  // Encabezado: solo contratista, RUT y fecha (el nombre ya está en el archivo y en las fotos).
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(40);
  const meta = `Contratista: ${contractorName} · RUT: ${card.rut ?? "—"} · Fecha: ${formatDate(card.createdAt)}`;
  pdf.text(pdf.splitTextToSize(meta, contentW)[0] ?? "", M, M + 5);
  pdf.setDrawColor(200);
  pdf.line(M, M + 9, W - M, M + 9);

  // Ambos lados a tamaño parecido al carnet real, centrados y uno debajo del otro.
  let y = M + 17;
  for (const data of [images.front, images.back]) {
    if (!data) continue;
    const props = pdf.getImageProperties(data);
    const scale = Math.min(CARD_W / props.width, CARD_H / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    pdf.addImage(data, "JPEG", (W - w) / 2, y, w, h, undefined, "FAST");
    y += h + GAP;
  }
}

async function newPdf(): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
}

export async function buildPdf(
  card: Pick<Card, "name" | "rut" | "createdAt">,
  images: CardImages,
  contractorName: string,
): Promise<Blob> {
  const pdf = await newPdf();
  pdf.setProperties({ title: card.name, subject: `Carnet - ${contractorName}` });
  drawCardPage(pdf, card, images, contractorName);
  return pdf.output("blob");
}

/** Lee las fotos de varios carnets, de 4 en 4 en paralelo. */
function loadMany(
  cards: Card[],
  loadImages: (id: string) => Promise<CardImages | null>,
  onProgress?: (done: number, total: number) => void,
) {
  return mapLimit(cards, 4, async (card) => ({ card, images: await loadImages(card.id) }), onProgress);
}

/** Un solo PDF con todos los carnets (una página por carnet). */
export async function buildCombinedPdf(
  cards: Card[],
  loadImages: (id: string) => Promise<CardImages | null>,
  contractorName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const loaded = await loadMany(cards, loadImages, onProgress);
  const pdf = await newPdf();
  pdf.setProperties({ title: `Carnets - ${contractorName}` });
  let first = true;
  for (const { card, images } of loaded) {
    if (!images) continue;
    if (!first) pdf.addPage();
    first = false;
    drawCardPage(pdf, card, images, contractorName);
  }
  return pdf.output("blob");
}

/** Un archivo PDF por carnet (para compartir varios a la vez). */
export async function buildPdfFiles(
  cards: Card[],
  loadImages: (id: string) => Promise<CardImages | null>,
  contractorName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  const loaded = await loadMany(cards, loadImages, onProgress);
  const used = new Set<string>();
  const files: File[] = [];
  for (const { card, images } of loaded) {
    if (!images) continue;
    const blob = await buildPdf(card, images, contractorName);
    files.push(new File([blob], uniqueName(pdfFileName(card.name, contractorName), used), { type: "application/pdf" }));
  }
  return files;
}

/** Nombre del PDF único: "Contratista - 12 carnets.pdf". */
export function combinedFileName(contractorName: string, count: number): string {
  const clean = contractorName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "Contratista";
  return `${clean} - ${count} ${count === 1 ? "carnet" : "carnets"}.pdf`;
}

export async function buildZip(
  contractorName: string,
  cards: Card[],
  loadImages: (id: string) => Promise<CardImages | null>,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const file of await buildPdfFiles(cards, loadImages, contractorName, onProgress)) zip.file(file.name, file);
  return zip.generateAsync({ type: "blob" });
}
