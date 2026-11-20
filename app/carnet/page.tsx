"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/Dialog";
import { btn, EmptyState, ErrorNote, Icon, PageHeader, Spinner } from "@/components/ui";
import { deleteCard, getCard, getCardImages, getContractor, type Card, type CardImages } from "@/lib/db";
import { downloadBlob, shareOrDownload } from "@/lib/files";
import { buildPdf, pdfFileName } from "@/lib/pdf";
import { formatDate } from "@/lib/text";

type Data = { card: Card; images: CardImages | null; contractorName: string };

function CardView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const card = await getCard(id);
      if (!card) return alive && setData(null);
      const [images, contractor] = await Promise.all([getCardImages(id), getContractor(card.contractorId)]);
      if (alive) setData({ card, images, contractorName: contractor?.name ?? "" });
    })().catch(() => alive && setError("No se pudo cargar el carnet."));
    return () => {
      alive = false;
    };
  }, [id]);

  if (data === null) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Carnet" backHref="/" />
        <EmptyState title="Este carnet no existe" />
      </div>
    );
  }

  const backHref = data ? `/contratista?id=${data.card.contractorId}` : "/";
  const fileName = data ? pdfFileName(data.card.name, data.contractorName) : "";

  async function makePdf(): Promise<Blob> {
    if (!data?.images) throw new Error("Sin imágenes");
    return buildPdf(data.card, data.images, data.contractorName);
  }

  async function onDownload() {
    setBusy("pdf");
    try {
      downloadBlob(await makePdf(), fileName);
    } catch {
      setError("No se pudo generar el PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    try {
      await shareOrDownload(await makePdf(), fileName, data?.card.name ?? "Carnet");
    } catch {
      setError("No se pudo compartir el PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32">
      <PageHeader
        title={data?.card.name ?? "…"}
        subtitle={data ? [data.contractorName, data.card.rut, formatDate(data.card.createdAt)].filter(Boolean).join(" · ") : " "}
        backHref={backHref}
      />

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {data === undefined ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="mb-4 flex items-center gap-2 text-sm break-all text-muted">
            <Icon.file width={18} height={18} className="shrink-0" />
            {fileName}
          </p>
          {data.images ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {(
                [
                  ["Lado frontal", data.images.front],
                  ["Lado trasero", data.images.back],
                ] as const
              ).map(([label, src]) => (
                <figure key={label}>
                  <figcaption className="mb-1.5 text-sm font-semibold tracking-wide text-muted uppercase">{label}</figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={label} className="w-full rounded-2xl bg-card shadow-sm ring-1 ring-line/60" />
                </figure>
              ))}
            </div>
          ) : (
            <EmptyState title="Faltan las fotos de este carnet" />
          )}
        </>
      )}

      {data && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-[1fr_1fr_auto] gap-2">
            <button type="button" className={btn.primary} onClick={onDownload} disabled={!data.images || busy !== null}>
              {busy === "pdf" ? <Spinner /> : <Icon.download />} PDF
            </button>
            <button type="button" className={btn.dark} onClick={onShare} disabled={!data.images || busy !== null}>
              {busy === "share" ? <Spinner /> : <Icon.share />} Compartir
            </button>
            <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)} aria-label="Eliminar carnet">
              <Icon.trash />
            </button>
          </div>
        </div>
      )}

      {confirmDelete && data && (
        <ConfirmDialog
          title="Eliminar carnet"
          message={
            <>
              Se eliminará el carnet de <strong className="text-ink">{data.card.name}</strong>. Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteCard(data.card);
            router.replace(backHref);
          }}
        />
      )}
    </div>
  );
}

function CardPage() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Carnet" backHref="/" />
        <EmptyState title="Falta el carnet" />
      </div>
    );
  }
  return <CardView key={id} id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CardPage />
    </Suspense>
  );
}
