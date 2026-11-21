"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAllowedUser } from "@/components/AuthProvider";
import { useGroup } from "@/components/GroupProvider";
import { CardRow } from "@/components/CardRow";
import { PromptDialog } from "@/components/Dialog";
import { Folder } from "@/components/Folder";
import { btn, EmptyState, ErrorNote, Icon, PageHeader, SearchBox, Spinner } from "@/components/ui";
import { createContractor, getAllCards, watchContractors, type Card, type Contractor } from "@/lib/db";
import { cleanRut } from "@/lib/rut";
import { normalize } from "@/lib/text";

export default function HomePage() {
  const { groups, group } = useGroup();
  const { isAdmin } = useAllowedUser();
  if (!groups) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!group) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader
          title="Contratistas"
          actions={
            <Link href="/configuracion" className={`${btn.ghost} text-muted`} aria-label="Configuración">
              <Icon.gear />
            </Link>
          }
        />
        <EmptyState title={isAdmin ? "Aún no hay grupos" : "Sin grupo"}>
          {isAdmin ? (
            <>
              Crea el primero en{" "}
              <Link href="/configuracion" className="font-medium text-accent underline">
                Configuración
              </Link>
              .
            </>
          ) : (
            "Pide a un administrador que te asigne un grupo."
          )}
        </EmptyState>
      </div>
    );
  }
  return <GroupHome key={group.id} groupId={group.id} />;
}

function GroupSelector() {
  const { groups, group, setGroupId } = useGroup();
  if (!groups || groups.length < 2 || !group) return null;
  return (
    <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Grupo">
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          role="radio"
          aria-checked={g.id === group.id}
          onClick={() => setGroupId(g.id)}
          className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition ${
            g.id === group.id ? "bg-ink text-paper" : "bg-card text-ink ring-1 ring-line"
          }`}
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}

function GroupHome({ groupId }: { groupId: string }) {
  const { user, username, isAdmin } = useAllowedUser();
  const { group } = useGroup();
  const router = useRouter();
  const [contractors, setContractors] = useState<Contractor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [allCards, setAllCards] = useState<Card[] | null>(null);

  useEffect(
    () => watchContractors(groupId, setContractors, () => setError("No se pudieron cargar los contratistas.")),
    [groupId],
  );

  const term = normalize(q);
  const searching = term.length >= 2;

  // Carga los trabajadores solo cuando se busca (para no gastar lecturas).
  const loadingRef = useRef(false);
  useEffect(() => {
    if (!searching || allCards || loadingRef.current) return;
    loadingRef.current = true;
    getAllCards(groupId)
      .then(setAllCards)
      .catch(() => setError("No se pudo buscar trabajadores."))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [searching, allCards, groupId]);
  const cardsLoading = searching && !allCards;

  const nameById = useMemo(() => new Map((contractors ?? []).map((c) => [c.id, c.name])), [contractors]);

  const filteredContractors = useMemo(
    () => (contractors ?? []).filter((c) => !term || normalize(c.name).includes(term)),
    [contractors, term],
  );

  const matchingCards = useMemo(() => {
    if (!searching || !allCards) return [];
    const rutTerm = cleanRut(q);
    return allCards
      .filter(
        (c) =>
          nameById.has(c.contractorId) &&
          (normalize(c.name).includes(term) || (rutTerm.length >= 3 && c.rut && cleanRut(c.rut).includes(rutTerm))),
      )
      .slice(0, 50);
  }, [searching, allCards, term, q, nameById]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
      <PageHeader
        title="Contratistas"
        subtitle={isAdmin ? `${group?.name} · Admin` : `${group?.name} · ${username}`}
        actions={
          <Link href="/configuracion" className={`${btn.ghost} text-muted`} aria-label="Configuración">
            <Icon.gear />
          </Link>
        }
      />

      {isAdmin && <GroupSelector />}
      <SearchBox value={q} onChange={setQ} placeholder="Buscar contratista o trabajador" />

      <div className="mt-5 space-y-6">
        {error && <ErrorNote>{error}</ErrorNote>}

        {contractors === null ? (
          !error && <div className="flex justify-center py-16 text-muted">
            <Spinner />
          </div>
        ) : contractors.length === 0 ? (
          <EmptyState title="Aún no hay contratistas">Crea el primero con el botón de abajo.</EmptyState>
        ) : (
          <section>
            {searching && <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Contratistas</h2>}
            {filteredContractors.length === 0 ? (
              <p className="text-muted">Ningún contratista coincide.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
                {filteredContractors.map((c) => (
                  <Folder key={c.id} contractor={c} />
                ))}
              </div>
            )}
          </section>
        )}

        {searching && (
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Trabajadores</h2>
            {cardsLoading ? (
              <Spinner className="text-muted" />
            ) : matchingCards.length === 0 ? (
              <p className="text-muted">Ningún trabajador coincide.</p>
            ) : (
              <ul className="space-y-2">
                {matchingCards.map((c) => {
                  const cname = nameById.get(c.contractorId) ?? "";
                  return (
                    <CardRow key={c.id} card={c} contractorName={cname} subtitle={[cname, c.rut].filter(Boolean).join(" · ")} />
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" className={`${btn.primary} px-6 shadow-lg`} onClick={() => setCreating(true)}>
          <Icon.plus /> Nuevo contratista
        </button>
      </div>

      {creating && (
        <PromptDialog
          title="Nuevo contratista"
          label="Nombre"
          confirmLabel="Crear"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const id = await createContractor(name, user.uid, groupId);
            router.push(`/contratista?id=${id}`);
          }}
        />
      )}
    </div>
  );
}
