"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAllowedUser } from "@/components/AuthProvider";
import { CameraCapture } from "@/components/CameraCapture";
import { btn, EmptyState, ErrorNote, Icon, input, PageHeader, Spinner } from "@/components/ui";
import { getContractor, saveCard } from "@/lib/db";
import { compressPair, makeThumb, resize, rotate90, toJpeg } from "@/lib/image";
import { mergeReads, needsBack, preloadOcr, readBack, readFront, type ReadResult } from "@/lib/ocr";
import { formatRut, isValidRut } from "@/lib/rut";
import { getSettings } from "@/lib/settings";

type Side = "front" | "back";
type Shots = { front: HTMLCanvasElement | null; back: HTMLCanvasElement | null };
const LABEL: Record<Side, string> = { front: "Lado frontal", back: "Lado trasero" };
type ReadStatus = "idle" | "reading" | "done" | "failed";
const QUICK_SECONDS = 2;

function ScanView({ contractorId }: { contractorId: string }) {
  const { user, username } = useAllowedUser();
  const router = useRouter();
  const backHref = `/contratista?id=${contractorId}`;

  const [contractorName, setContractorName] = useState<string | null | undefined>(undefined);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Side | null>("front");
  const [shots, setShots] = useState<Shots>({ front: null, back: null });
  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const touched = useRef({ name: false, rut: false });
  const [readStatus, setReadStatus] = useState<ReadStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  // Guardado rápido: momento en que se guardará solo (null = no hay cuenta regresiva).
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const countdown = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

  useEffect(() => {
    getContractor(contractorId)
      .then((c) => {
        setContractorName(c ? c.name : null);
        setGroupId(c?.groupId ?? null);
      })
      .catch(() => setError("No se pudo cargar el contratista. Revisa tu conexión."));
    if (getSettings().autoRead) preloadOcr().catch(() => undefined);
  }, [contractorId]);

  /* ---------- Lectura automática: el frontal se lee apenas se captura ---------- */
  const runId = useRef(0);
  const frontRead = useRef<Promise<ReadResult> | null>(null);

  const applyResult = useCallback((r: ReadResult) => {
    if (r.name && !touched.current.name) setName(r.name);
    if (r.rut && !touched.current.rut) setRut(r.rut);
  }, []);

  const analyze = useCallback(
    (next: Shots, changed: Side) => {
      if (!getSettings().autoRead || !next.front) return;
      const id = ++runId.current;
      if (changed === "front" || !frontRead.current) frontRead.current = readFront(next.front);
      setDeadline(null);
      setReadStatus("reading");
      const front = frontRead.current;
      (async () => {
        const f = await front;
        if (id !== runId.current) return;
        applyResult(f); // se ve mientras se captura el reverso
        if (!next.back) return;
        const r = needsBack(f) ? mergeReads(f, await readBack(next.back)) : f;
        if (id !== runId.current) return;
        applyResult(r);
        setReadStatus(r.name || r.rut ? "done" : "failed");
        // Guardado rápido: lectura completa y nada corregido a mano → guarda solo en 2 s.
        const s = getSettings();
        if (s.quickSave && s.autoRead && r.name && r.rutValid && !touched.current.name && !touched.current.rut) {
          const t = Date.now();
          setNow(t);
          setDeadline(t + QUICK_SECONDS * 1000);
        }
      })().catch(() => id === runId.current && setReadStatus("failed"));
    },
    [applyResult],
  );

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
      setShots(next);
      setJustSaved(null);
      analyze(next, camera);
      // Tras el frontal, pasar al trasero si falta.
      setCamera(camera === "front" && !next.back ? "back" : null);
    },
    [camera, shots, analyze],
  );

  function closeCamera() {
    if (!shots.front && !shots.back) router.push(backHref);
    else setCamera(null);
  }

  function rotate(side: Side) {
    const current = shots[side];
    if (!current) return;
    const next = { ...shots, [side]: rotate90(current) };
    setShots(next);
    analyze(next, side);
  }

  const rutInvalid = rut.trim().length > 0 && !isValidRut(rut);
  const canSave = Boolean(name.trim() && shots.front && shots.back && !saving);

  /* ---------- Guardar ---------- */
  const save = useCallback(
    async (andContinue: boolean) => {
      setDeadline(null);
      if (!shots.front || !shots.back || !name.trim()) return;
      if (!groupId) {
        setError("Este contratista no tiene grupo. Asígnale uno en Configuración.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const images = compressPair(shots.front, shots.back);
        // No espera al servidor: queda guardado al instante y se sube en segundo plano.
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
        if (!andContinue) {
          router.replace(backHref);
          return;
        }
        // Siguiente carnet.
        runId.current++;
        frontRead.current = null;
        touched.current = { name: false, rut: false };
        setSavedCount((n) => n + 1);
        setJustSaved(name.trim());
        setShots({ front: null, back: null });
        setName("");
        setRut("");
        setReadStatus("idle");
        setSaving(false);
        setCamera("front");
      } catch {
        setError("No se pudo guardar el carnet. Inténtalo de nuevo.");
        setSaving(false);
      }
    },
    [shots, name, rut, groupId, contractorId, user.uid, username, router, backHref],
  );

  /* ---------- Guardado rápido: cuenta regresiva ---------- */
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) {
        clearInterval(t);
        setDeadline(null);
        void saveRef.current(true);
      }
    }, 150);
    return () => clearInterval(t);
  }, [deadline]);

  function cancelQuick() {
    touched.current.name = true; // no volver a guardar solo este carnet
    setDeadline(null);
  }

  if (contractorName === null) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <PageHeader title="Escanear" backHref="/" />
        <EmptyState title="Este contratista no existe" />
      </div>
    );
  }

  const counter = savedCount > 0 ? `${savedCount} ${savedCount === 1 ? "guardado" : "guardados"}` : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40">
      <PageHeader
        title="Nuevo carnet"
        subtitle={[contractorName ?? " ", counter].filter(Boolean).join(" · ")}
        backHref={backHref}
      />

      {justSaved && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-ok/15 px-4 py-2 text-sm font-medium text-ok">
          <Icon.check width={18} height={18} /> Guardado: {justSaved}
        </p>
      )}

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
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => {
                      setDeadline(null);
                      setCamera(side);
                    }}
                  >
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
              setDeadline(null);
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
              setDeadline(null);
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

        {(name || rut) && countdown === null && (
          <p className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-line">Revisa que los datos estén correctos.</p>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-2">
          {countdown !== null ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 overflow-hidden rounded-xl bg-accent px-4 py-3 text-center font-semibold text-white">
                <span
                  className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-200 ease-linear"
                  style={{ width: `${Math.min(100, (1 - Math.max(0, (deadline! - now) / 1000) / QUICK_SECONDS) * 100)}%` }}
                  aria-hidden
                />
                <span className="relative">Guardando en {Math.max(1, countdown)}…</span>
              </div>
              <button type="button" className={btn.secondary} onClick={cancelQuick}>
                Corregir
              </button>
            </div>
          ) : (
            <>
              <button type="button" className={`${btn.primary} w-full`} onClick={() => save(true)} disabled={!canSave}>
                {saving ? <Spinner /> : <Icon.camera />} Guardar y escanear otro
              </button>
              <button type="button" className={`${btn.secondary} w-full`} onClick={() => save(false)} disabled={!canSave}>
                Guardar y terminar
              </button>
            </>
          )}
        </div>
      </div>

      {camera && (
        <CameraCapture
          title={LABEL[camera]}
          subtitle={counter}
          startDisarmed={savedCount > 0 && camera === "front" && !shots.front}
          onCapture={onCapture}
          onClose={closeCamera}
        />
      )}
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
