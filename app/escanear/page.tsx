"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAllowedUser } from "@/components/AuthProvider";
import { CameraCapture } from "@/components/CameraCapture";
import { btn, EmptyState, ErrorNote, Icon, input, PageHeader, Spinner } from "@/components/ui";
import { getContractor, saveCard } from "@/lib/db";
import { compressPair, makeThumb, resize, rotate90, toJpeg } from "@/lib/image";
import { preloadOcr, readCard } from "@/lib/ocr";
import { formatRut, isValidRut } from "@/lib/rut";
import { getSettings } from "@/lib/settings";

type Side = "front" | "back";
const LABEL: Record<Side, string> = { front: "Lado frontal", back: "Lado trasero" };
type ReadStatus = "idle" | "reading" | "done" | "failed";

function ScanView({ contractorId }: { contractorId: string }) {
  const { user, username } = useAllowedUser();
  const router = useRouter();
  const backHref = `/contratista?id=${contractorId}`;

  const [contractorName, setContractorName] = useState<string | null | undefined>(undefined);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Side | null>("front");
  const [shots, setShots] = useState<{ front: HTMLCanvasElement | null; back: HTMLCanvasElement | null }>({
    front: null,
    back: null,
  });
  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const touched = useRef({ name: false, rut: false });
  const [readStatus, setReadStatus] = useState<ReadStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getContractor(contractorId)
      .then((c) => {
        setContractorName(c ? c.name : null);
        setGroupId(c?.groupId ?? null);
      })
      .catch(() => setError("No se pudo cargar el contratista. Revisa tu conexión."));
    // Cargar el OCR en segundo plano mientras se captura.
    if (getSettings().autoRead) preloadOcr().catch(() => undefined);
  }, [contractorId]);

  // Lectura automática cuando están ambos lados (se repite si cambia una foto).
  const runId = useRef(0);
  const updateShots = useCallback((next: { front: HTMLCanvasElement | null; back: HTMLCanvasElement | null }) => {
    setShots(next);
    const { front, back } = next;
    if (!front || !back || !getSettings().autoRead) return;
    const id = ++runId.current;
    setReadStatus("reading");
    readCard(front, back)
      .then((r) => {
        if (id !== runId.current) return;
        if (r.name && !touched.current.name) setName(r.name);
        if (r.rut && !touched.current.rut) setRut(r.rut);
        setReadStatus(r.name || r.rut ? "done" : "failed");
      })
      .catch(() => id === runId.current && setReadStatus("failed"));
  }, []);

  const previews = useMemo(
    () => ({
      front: shots.front ? toJpeg(resize(shots.front, 900), 0.85) : null,
      back: shots.back ? toJpeg(resize(shots.back, 900), 0.85) : null,
    }),
    [shots],
  );

  const onCapture = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!camera) return;
      const next = { ...shots, [camera]: canvas };
      updateShots(next);
      // Tras el frontal, pasar al trasero si falta.
      setCamera(camera === "front" && !next.back ? "back" : null);
    },
    [camera, shots, updateShots],
  );

  function closeCamera() {
    if (!shots.front && !shots.back) router.push(backHref);
    else setCamera(null);
  }

  function rotate(side: Side) {
    const current = shots[side];
    if (current) updateShots({ ...shots, [side]: rotate90(current) });
  }

  const rutInvalid = rut.trim().length > 0 && !isValidRut(rut);
  const canSave = Boolean(name.trim() && shots.front && shots.back && !saving);

  async function save() {
    if (!shots.front || !shots.back || !name.trim()) return;
    if (!groupId) {
      setError("Este contratista no tiene grupo. Asígnale uno en Configuración.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const images = compressPair(shots.front, shots.back);
      await saveCard({
        groupId,
        contractorId,
        name,
        rut: rut.trim() ? formatRut(rut) : null,
        thumb: makeThumb(shots.front),
        images,
        uid: user.uid,
        username,
      });
      router.replace(backHref);
    } catch {
      setError("No se pudo guardar el carnet. Revisa tu conexión e inténtalo de nuevo.");
      setSaving(false);
    }
  }

  if (contractorName === null) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Escanear" backHref="/" />
        <EmptyState title="Este contratista no existe" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32">
      <PageHeader title="Nuevo carnet" subtitle={contractorName ?? " "} backHref={backHref} />

      <div className="grid gap-4 sm:grid-cols-2">
        {(["front", "back"] as Side[]).map((side) => (
          <section key={side}>
            <h2 className="mb-1.5 text-sm font-semibold tracking-wide text-muted uppercase">{LABEL[side]}</h2>
            {previews[side] ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[side]!}
                  alt={LABEL[side]}
                  className="max-h-64 w-full rounded-2xl bg-card object-contain shadow-sm ring-1 ring-line/60"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" className={btn.secondary} onClick={() => setCamera(side)}>
                    <Icon.camera /> Repetir
                  </button>
                  <button type="button" className={btn.secondary} onClick={() => rotate(side)}>
                    <Icon.rotate /> Girar 90°
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setCamera(side)}
                className="flex aspect-[85.6/54] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-muted"
              >
                <Icon.camera width={32} height={32} />
                Capturar {LABEL[side].toLowerCase()}
              </button>
            )}
          </section>
        ))}
      </div>

      <section className="mt-6 space-y-4">
        <ReadStatusLine status={readStatus} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Nombre</span>
          <input
            className={input}
            value={name}
            onChange={(e) => {
              touched.current.name = true;
              setName(e.target.value);
            }}
            placeholder="Nombres y apellidos"
            autoComplete="off"
            autoCapitalize="words"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">RUT</span>
          <input
            className={`${input} ${rutInvalid ? "border-accent" : ""}`}
            value={rut}
            onChange={(e) => {
              touched.current.rut = true;
              setRut(e.target.value);
            }}
            onBlur={() => rut.trim() && setRut(formatRut(rut))}
            placeholder="12.345.678-5"
            inputMode="text"
            autoComplete="off"
            aria-invalid={rutInvalid}
          />
          {rutInvalid && <span className="mt-1.5 block text-sm text-accent">El dígito verificador no coincide. Revisa el RUT.</span>}
        </label>

        {(name || rut) && (
          <p className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-line">Revisa que los datos estén correctos.</p>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button type="button" className={`${btn.primary} w-full`} onClick={save} disabled={!canSave}>
            {saving ? (
              <>
                <Spinner /> Guardando…
              </>
            ) : (
              "Guardar"
            )}
          </button>
        </div>
      </div>

      {camera && <CameraCapture title={LABEL[camera]} onCapture={onCapture} onClose={closeCamera} />}
    </div>
  );
}

function ReadStatusLine({ status }: { status: ReadStatus }) {
  if (status === "idle") return null;
  const text = { reading: "Leyendo datos…", done: "Datos leídos", failed: "No se pudieron leer" }[status];
  return (
    <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
      {status === "reading" ? <Spinner className="h-4 w-4" /> : status === "done" ? <Icon.check width={18} height={18} /> : null}
      {text}
      {status === "failed" && " — escríbelos a mano."}
    </p>
  );
}

function ScanPage() {
  const id = useSearchParams().get("contratista");
  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Escanear" backHref="/" />
        <EmptyState title="Falta el contratista">
          <Link href="/" className="underline">
            Elegir contratista
          </Link>
        </EmptyState>
      </div>
    );
  }
  return <ScanView key={id} contractorId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScanPage />
    </Suspense>
  );
}
