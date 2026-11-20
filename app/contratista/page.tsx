"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAllowedUser } from "@/components/AuthProvider";
import { CardRow } from "@/components/CardRow";
import { ConfirmDialog, ProgressDialog, PromptDialog } from "@/components/Dialog";
import { btn, EmptyState, ErrorNote, Icon, PageHeader, SearchBox, Spinner } from "@/components/ui";
import {
  deleteContractor,
  getCardImages,
  renameContractor,
  watchCards,
  watchContractor,
  type Card,
  type Contractor,
} from "@/lib/db";
import { downloadBlob } from "@/lib/files";
import { buildZip, zipFileName } from "@/lib/pdf";
import { cleanRut } from "@/lib/rut";
import { normalize } from "@/lib/text";

function ContractorView({ id }: { id: string }) {
  const { isAdmin } = useAllowedUser();
  const router = useRouter();
  const [contractor, setContractor] = useState<Contractor | null | undefined>(undefined);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);

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

  async function downloadZip() {
    if (!contractor || !cards?.length) return;
    setMenuOpen(false);
    setZip({ done: 0, total: cards.length });
    try {
      const blob = await buildZip(contractor.name, cards, getCardImages, (done, total) => setZip({ done, total }));
      downloadBlob(blob, zipFileName(contractor.name));
    } catch {
      alert("No se pudo generar el ZIP.");
    } finally {
      setZip(null);
    }
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
                  {isAdmin && (
                    <MenuItem icon={<Icon.edit />} onClick={() => { setMenuOpen(false); setDialog("rename"); }}>
                      Renombrar
                    </MenuItem>
                  )}
                  <MenuItem icon={<Icon.download />} onClick={downloadZip} disabled={!cards?.length}>
                    Descargar todo (ZIP)
                  </MenuItem>
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
              <CardRow key={c.id} card={c} contractorName={contractor?.name ?? ""} />
            ))}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link href={`/escanear?contratista=${id}`} className={`${btn.primary} px-6 shadow-lg`}>
          <Icon.camera /> Escanear carnet
        </Link>
      </div>

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

      {zip && <ProgressDialog title="Preparando ZIP" done={zip.done} total={zip.total} />}
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
