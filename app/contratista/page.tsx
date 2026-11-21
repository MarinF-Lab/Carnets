"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAllowedUser } from "@/components/AuthProvider";
import { CardRow } from "@/components/CardRow";
import { ConfirmDialog, ProgressDialog, PromptDialog, Sheet } from "@/components/Dialog";
import { btn, EmptyState, ErrorNote, Icon, PageHeader, SearchBox, Spinner } from "@/components/ui";
import {
  deleteContractor,
  emptyContractor,
  getCardImages,
  renameContractor,
  watchCards,
  watchContractor,
  type Card,
  type Contractor,
} from "@/lib/db";
import { downloadBlob, shareFiles } from "@/lib/files";
import { preloadOcr } from "@/lib/ocr";
import { getSettings } from "@/lib/settings";
import { buildCombinedPdf, buildPdfFiles, buildZip, combinedFileName, zipFileName } from "@/lib/pdf";
import { cleanRut } from "@/lib/rut";
import { normalize } from "@/lib/text";

function ContractorView({ id }: { id: string }) {
  const { isAdmin } = useAllowedUser();
  const router = useRouter();
  const [contractor, setContractor] = useState<Contractor | null | undefined>(undefined);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<"rename" | "delete" | "empty" | null>(null);
  const [emptying, setEmptying] = useState<{ done: number; total: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<{ title: string; done: number; total: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [readyShare, setReadyShare] = useState<File[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Precargar el lector de texto para que el escaneo empiece más rápido.
  useEffect(() => {
    if (!getSettings().autoRead) return;
    const t = setTimeout(() => preloadOcr().catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => watchContractor(id, setContractor, () => setError("No se pudo cargar el contratista.")), [id]);
  const contractorGroup = contractor?.groupId ?? null;
  const loaded = contractor != null;
  useEffect(() => {
    if (!loaded) return;
    return watchCards({ id, groupId: contractorGroup }, setCards, () => setError("No se pudieron cargar los carnets."));
  }, [id, contractorGroup, loaded]);

  const filtered = useMemo(() => {
    const term = normalize(q);
    if (!term || !cards) return cards ?? [];
    const rutTerm = cleanRut(q);
    return cards.filter(
      (c) => normalize(c.name).includes(term) || (rutTerm.length >= 3 && c.rut && cleanRut(c.rut).includes(rutTerm)),
    );
  }, [cards, q]);

  /** Carnets a exportar: los seleccionados, o todos. */
  function target(): Card[] {
    if (!cards) return [];
    return selecting ? cards.filter((c) => selected.has(c.id)) : cards;
  }

  async function withProgress(title: string, total: number, fn: (p: (d: number, t: number) => void) => Promise<void>) {
    setMenuOpen(false);
    setProgress({ title, done: 0, total });
    try {
      await fn((done, t) => setProgress({ title, done, total: t }));
    } catch {
      alert("No se pudo completar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setProgress(null);
    }
  }

  async function downloadZip() {
    const list = target();
    if (!contractor || !list.length) return;
    await withProgress("Preparando ZIP", list.length, async (p) => {
      downloadBlob(await buildZip(contractor.name, list, getCardImages, p), zipFileName(contractor.name));
    });
  }

  async function downloadCombined() {
    const list = target();
    if (!contractor || !list.length) return;
    await withProgress("Preparando PDF", list.length, async (p) => {
      const blob = await buildCombinedPdf(list, getCardImages, contractor.name, p);
      downloadBlob(blob, combinedFileName(contractor.name, list.length));
    });
  }

  async function shareSelected() {
    const list = target();
    if (!contractor || !list.length) return;
    await withProgress("Preparando PDFs", list.length, async (p) => {
      // El navegador solo deja compartir justo después de un toque: se arma todo y
      // luego se muestra el botón "Compartir".
      setReadyShare(await buildPdfFiles(list, getCardImages, contractor.name, p));
    });
  }

  async function doShare(files: File[]) {
    const res = await shareFiles(files, `Carnets - ${contractor?.name ?? ""}`);
    if (res === "unsupported") {
      // Sin "compartir archivos" en este navegador: descargarlos en un ZIP.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f));
      downloadBlob(await zip.generateAsync({ type: "blob" }), zipFileName(contractor?.name ?? "Carnets"));
    }
    if (res !== "cancelled") setReadyShare(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  if (contractor === null) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Contratista" backHref="/" />
        <EmptyState title="Este contratista no existe">
          <Link href="/" className="underline">
            Volver al inicio
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
      {selecting ? (
        <PageHeader
          title={`${selected.size} ${selected.size === 1 ? "seleccionado" : "seleccionados"}`}
          subtitle={contractor?.name}
          actions={
            <>
              <button
                type="button"
                className={`${btn.ghost} text-sm`}
                onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))}
              >
                {selected.size === filtered.length && filtered.length > 0 ? "Ninguno" : "Todos"}
              </button>
              <button type="button" className={btn.ghost} onClick={stopSelecting} aria-label="Salir de la selección">
                <Icon.close />
              </button>
            </>
          }
        />
      ) : (
      <PageHeader
        title={contractor?.name ?? "…"}
        subtitle={cards ? `${cards.length} ${cards.length === 1 ? "carnet" : "carnets"}` : " "}
        backHref="/"
        actions={
          <div className="relative">
            <button
              type="button"
              className={btn.ghost}
              aria-label="Acciones"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!contractor}
            >
              <Icon.more />
            </button>
            {menuOpen && (
              <>
                <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-12 right-0 z-20 w-60 overflow-hidden rounded-2xl bg-card py-1 shadow-xl ring-1 ring-line">
                  <MenuItem icon={<Icon.edit />} onClick={() => { setMenuOpen(false); setDialog("rename"); }}>
                    Renombrar
                  </MenuItem>
                  <MenuItem
                    icon={<Icon.check />}
                    onClick={() => { setMenuOpen(false); setSelecting(true); }}
                    disabled={!cards?.length}
                  >
                    Seleccionar varios
                  </MenuItem>
                  <MenuItem icon={<Icon.file />} onClick={downloadCombined} disabled={!cards?.length}>
                    PDF único con todos
                  </MenuItem>
                  <MenuItem icon={<Icon.download />} onClick={downloadZip} disabled={!cards?.length}>
                    Descargar todo (ZIP)
                  </MenuItem>
                  {isAdmin && (
                    <MenuItem
                      icon={<Icon.empty />}
                      danger
                      disabled={!cards?.length}
                      onClick={() => { setMenuOpen(false); setDialog("empty"); }}
                    >
                      Vaciar carpeta
                    </MenuItem>
                  )}
                  {isAdmin && (
                    <MenuItem icon={<Icon.trash />} danger onClick={() => { setMenuOpen(false); setDialog("delete"); }}>
                      Eliminar contratista
                    </MenuItem>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      )}

      <SearchBox value={q} onChange={setQ} placeholder="Buscar por nombre o RUT" />

      <div className="mt-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {cards === null ? (
          <div className="flex justify-center py-16 text-muted">
            <Spinner />
          </div>
        ) : cards.length === 0 ? (
          <EmptyState title="Sin carnets todavía">Escanea el primero con el botón de abajo.</EmptyState>
        ) : filtered.length === 0 ? (
          <p className="text-muted">Ningún trabajador coincide.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                contractorName={contractor?.name ?? ""}
                selecting={selecting}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {selecting ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2">
            <button type="button" className={`${btn.primary} px-2 text-sm`} onClick={shareSelected} disabled={!selected.size}>
              <Icon.share width={18} height={18} /> Compartir
            </button>
            <button type="button" className={`${btn.dark} px-2 text-sm`} onClick={downloadCombined} disabled={!selected.size}>
              <Icon.file width={18} height={18} /> PDF único
            </button>
            <button type="button" className={`${btn.secondary} px-2 text-sm`} onClick={downloadZip} disabled={!selected.size}>
              <Icon.download width={18} height={18} /> ZIP
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link href={`/escanear?contratista=${id}`} className={`${btn.primary} px-6 shadow-lg`}>
            <Icon.camera /> Escanear carnet
          </Link>
        </div>
      )}

      {dialog === "rename" && contractor && (
        <PromptDialog
          title="Renombrar contratista"
          label="Nombre"
          initialValue={contractor.name}
          confirmLabel="Guardar"
          onClose={() => setDialog(null)}
          onSubmit={(name) => renameContractor(id, name)}
        />
      )}

      {dialog === "delete" && contractor && (
        <ConfirmDialog
          title="Eliminar contratista"
          message={
            <>
              Se eliminará <strong className="text-ink">{contractor.name}</strong> junto con sus{" "}
              {cards?.length ?? 0} carnets. Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteContractor(id);
            router.replace("/");
          }}
        />
      )}

      {dialog === "empty" && contractor && (
        <ConfirmDialog
          title="Vaciar carpeta"
          message={
            <>
              Se eliminarán los <strong className="text-ink">{cards?.length ?? 0} carnets</strong> de{" "}
              <strong className="text-ink">{contractor.name}</strong>. La carpeta se mantiene. Esta acción no se puede
              deshacer.
            </>
          }
          confirmLabel="Vaciar"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setDialog(null);
            try {
              await emptyContractor(contractor, (done, total) => setEmptying({ done, total }));
            } catch {
              alert("No se pudo vaciar la carpeta.");
            } finally {
              setEmptying(null);
            }
          }}
        />
      )}

      {emptying && <ProgressDialog title="Vaciando carpeta" done={emptying.done} total={emptying.total} />}
      {readyShare && (
        <Sheet onClose={() => setReadyShare(null)}>
          <h2 className="text-xl font-bold">Listo</h2>
          <p className="mt-1 text-muted">
            {readyShare.length} {readyShare.length === 1 ? "PDF preparado" : "PDFs preparados"}.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" className={btn.secondary} onClick={() => setReadyShare(null)}>
              Cancelar
            </button>
            <button type="button" className={btn.primary} onClick={() => doShare(readyShare)}>
              <Icon.share /> Compartir
            </button>
          </div>
        </Sheet>
      )}

      {progress && <ProgressDialog title={progress.title} done={progress.done} total={progress.total} />}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-base active:bg-line/60 disabled:opacity-40 ${danger ? "text-accent" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ContractorPage() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Contratista" backHref="/" />
        <EmptyState title="Falta el contratista" />
      </div>
    );
  }
  return <ContractorView key={id} id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContractorPage />
    </Suspense>
  );
}
