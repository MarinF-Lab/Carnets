"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAllowedUser } from "@/components/AuthProvider";
import { useRegisteredBy } from "@/components/useRegisteredBy";
import { ConfirmDialog, Sheet } from "@/components/Dialog";
import { btn, EmptyState, ErrorNote, Icon, input, PageHeader, Spinner } from "@/components/ui";
import { deleteCard, getCard, getCardImages, getContractor, updateCard, type Card, type CardImages } from "@/lib/db";
import { downloadBlob, shareOrDownload } from "@/lib/files";
import { buildPdf, pdfFileName } from "@/lib/pdf";
import { formatRut, isValidRut } from "@/lib/rut";
import { formatDate } from "@/lib/text";

type Data = { card: Card; images: CardImages | null; contractorName: string };

function CardView({ id }: { id: string }) {
  const router = useRouter();
  const { isAdmin, username } = useAllowedUser();
  const registeredBy = useRegisteredBy();
  const [editing, setEditing] = useState(false);
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
        actions={
          data && (
            <button type="button" className={btn.ghost} onClick={() => setEditing(true)} aria-label="Editar datos">
              <Icon.edit />
            </button>
          )
        }
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
          {registeredBy && (
            <p className="-mt-2 mb-4 text-sm text-muted">
              Registrado por <strong className="font-medium text-ink">{registeredBy(data.card)}</strong>
              {data.card.updatedByName && <> · editado por {data.card.updatedByName}</>}
            </p>
          )}
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
          <div className={`mx-auto grid max-w-3xl gap-2 ${isAdmin ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-2"}`}>
            <button type="button" className={btn.primary} onClick={onDownload} disabled={!data.images || busy !== null}>
              {busy === "pdf" ? <Spinner /> : <Icon.download />} PDF
            </button>
            <button type="button" className={btn.dark} onClick={onShare} disabled={!data.images || busy !== null}>
              {busy === "share" ? <Spinner /> : <Icon.share />} Compartir
            </button>
            {isAdmin && (
              <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)} aria-label="Eliminar carnet">
                <Icon.trash />
              </button>
            )}
          </div>
        </div>
      )}

      {editing && data && (
        <EditCardDialog
          card={data.card}
          onClose={() => setEditing(false)}
          onSave={async (name, rut) => {
            await updateCard(data.card.id, { name, rut }, username);
            setData({ ...data, card: { ...data.card, name: name.trim(), rut, updatedByName: username } });
            setEditing(false);
          }}
        />
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

function EditCardDialog({
  card,
  onClose,
  onSave,
}: {
  card: Card;
  onClose: () => void;
  onSave: (name: string, rut: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(card.name);
  const [rut, setRut] = useState(card.rut ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rutInvalid = rut.trim().length > 0 && !isValidRut(rut);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name, rut.trim() ? formatRut(rut) : null);
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold">Editar datos</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Nombre</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoFocus required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">RUT</span>
          <input
            className={`${input} ${rutInvalid ? "border-accent" : ""}`}
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            onBlur={() => rut.trim() && setRut(formatRut(rut))}
            placeholder="12.345.678-5"
            aria-invalid={rutInvalid}
          />
          {rutInvalid && <span className="mt-1.5 block text-sm text-accent">El dígito verificador no coincide. Revisa el RUT.</span>}
        </label>
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : "Guardar"}
          </button>
        </div>
      </form>
    </Sheet>
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
