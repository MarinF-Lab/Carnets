"use client";

import Link from "next/link";
import { useState } from "react";
import type { Card } from "@/lib/db";
import { getCardImages } from "@/lib/db";
import { downloadBlob } from "@/lib/files";
import { buildPdf, pdfFileName } from "@/lib/pdf";
import { formatDate } from "@/lib/text";
import { btn, Spinner } from "./ui";

/** Fila de un trabajador: miniatura, nombre, RUT, fecha y botón PDF. */
export function CardRow({ card, contractorName, subtitle }: { card: Card; contractorName: string; subtitle?: string }) {
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const images = await getCardImages(card.id);
      if (!images) throw new Error("Sin imágenes");
      const blob = await buildPdf(card, images, contractorName);
      downloadBlob(blob, pdfFileName(card.name, contractorName));
    } catch {
      alert("No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-2.5 pr-3 shadow-sm ring-1 ring-line/60">
      <Link href={`/carnet?id=${card.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {card.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.thumb} alt="" className="h-12 w-[76px] shrink-0 rounded-lg bg-line object-cover" />
        ) : (
          <div className="h-12 w-[76px] shrink-0 rounded-lg bg-line" />
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{card.name}</p>
          <p className="truncate text-sm text-muted">
            {subtitle ?? [card.rut ?? "Sin RUT", formatDate(card.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </Link>
      <button type="button" onClick={downloadPdf} disabled={busy} className={`${btn.secondary} shrink-0 px-3 text-sm`}>
        {busy ? <Spinner className="h-4 w-4" /> : "PDF"}
      </button>
    </li>
  );
}
