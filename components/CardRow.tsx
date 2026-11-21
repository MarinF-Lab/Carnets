"use client";

import Link from "next/link";
import { useState } from "react";
import type { Card } from "@/lib/db";
import { deleteCard, getCardImages } from "@/lib/db";
import { useAllowedUser } from "./AuthProvider";
import { ConfirmDialog } from "./Dialog";
import { useRegisteredBy } from "./useRegisteredBy";
import { downloadBlob } from "@/lib/files";
import { buildPdf, pdfFileName } from "@/lib/pdf";
import { formatDate } from "@/lib/text";
import { btn, Icon, Spinner } from "./ui";

/** Fila de un trabajador: miniatura, nombre, RUT, fecha y botón PDF. */
export function CardRow({
  card,
  contractorName,
  subtitle,
  selecting,
  selected,
  onToggle,
}: {
  card: Card;
  contractorName: string;
  subtitle?: string;
  /** Modo selección: la fila marca/desmarca en vez de abrir el carnet. */
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { isAdmin } = useAllowedUser();
  const registeredBy = useRegisteredBy();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const content = (
    <>
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
        {registeredBy && <p className="truncate text-xs text-muted">Registrado por {registeredBy(card)}</p>}
      </div>
    </>
  );

  if (selecting) {
    return (
      <li>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          className={`flex w-full items-center gap-3 rounded-2xl bg-card p-2.5 pr-3 text-left shadow-sm ring-1 transition ${
            selected ? "ring-2 ring-accent" : "ring-line/60"
          }`}
        >
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
              selected ? "border-accent bg-accent text-white" : "border-line"
            }`}
          >
            {selected && <Icon.check width={14} height={14} strokeWidth={3} />}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-3">{content}</span>
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-2.5 pr-3 shadow-sm ring-1 ring-line/60">
      <Link href={`/carnet?id=${card.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {content}
      </Link>
      <button type="button" onClick={downloadPdf} disabled={busy} className={`${btn.secondary} shrink-0 px-3 text-sm`}>
        {busy ? <Spinner className="h-4 w-4" /> : "PDF"}
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className={`${btn.ghost} -mr-2 shrink-0 text-muted`}
          aria-label={`Eliminar carnet de ${card.name}`}
        >
          <Icon.trash width={20} height={20} />
        </button>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar carnet"
          message={
            <>
              Se eliminará el carnet de <strong className="text-ink">{card.name}</strong>. Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => deleteCard(card)}
        />
      )}
    </li>
  );
}
