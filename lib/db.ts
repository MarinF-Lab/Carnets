/** Acceso a Firestore según la sección 3 de CLAUDE.md. */
import {
  collection,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type Contractor = {
  id: string;
  groupId: string | null;
  name: string;
  cardCount: number;
  createdAt: Date | null;
};

export type Card = {
  id: string;
  groupId: string | null;
  contractorId: string;
  name: string;
  rut: string | null;
  thumb: string;
  createdAt: Date | null;
  /** Usuario que escaneó el carnet (uid y nombre). */
  createdBy: string | null;
  createdByName: string | null;
  /** Último usuario que corrigió nombre o RUT. */
  updatedByName: string | null;
};

export type CardImages = { front: string; back: string };

const contractorsCol = () => collection(db(), "contractors");
const cardsCol = () => collection(db(), "cards");
const imagesDoc = (cardId: string) => doc(db(), "cards", cardId, "images", "main");

function toDate(v: unknown): Date | null {
  return v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : null;
}

function toContractor(s: QueryDocumentSnapshot | DocumentSnapshot): Contractor {
  const d = s.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: s.id,
    groupId: d.groupId ? String(d.groupId) : null,
    name: String(d.name ?? ""),
    cardCount: Math.max(0, Number(d.cardCount ?? 0)),
    createdAt: toDate(d.createdAt),
  };
}

function toCard(s: QueryDocumentSnapshot | DocumentSnapshot): Card {
  const d = s.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: s.id,
    groupId: d.groupId ? String(d.groupId) : null,
    contractorId: String(d.contractorId ?? ""),
    name: String(d.name ?? ""),
    rut: d.rut ? String(d.rut) : null,
    thumb: String(d.thumb ?? ""),
    createdAt: toDate(d.createdAt),
    createdBy: d.createdBy ? String(d.createdBy) : null,
    createdByName: d.createdByName ? String(d.createdByName) : null,
    updatedByName: d.updatedByName ? String(d.updatedByName) : null,
  };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "es", { sensitivity: "base" });
const byNewest = (a: Card, b: Card) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);

/* ---------- Contratistas ---------- */

/** Contratistas de un grupo. */
export function watchContractors(
  groupId: string,
  cb: (list: Contractor[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(contractorsCol(), where("groupId", "==", groupId)),
    (snap) => cb(snap.docs.map(toContractor).sort(byName)),
    onError,
  );
}

export function watchContractor(
  id: string,
  cb: (c: Contractor | null) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(doc(contractorsCol(), id), (s) => cb(s.exists() ? toContractor(s) : null), onError);
}

export async function getContractor(id: string): Promise<Contractor | null> {
  const s = await getDoc(doc(contractorsCol(), id));
  return s.exists() ? toContractor(s) : null;
}

export async function createContractor(name: string, uid: string, groupId: string): Promise<string> {
  const ref = doc(contractorsCol());
  const batch = writeBatch(db());
  batch.set(ref, { groupId, name: name.trim(), cardCount: 0, createdAt: serverTimestamp(), createdBy: uid });
  await batch.commit();
  return ref.id;
}

export async function renameContractor(id: string, name: string): Promise<void> {
  const batch = writeBatch(db());
  batch.update(doc(contractorsCol(), id), { name: name.trim() });
  await batch.commit();
}

/** Elimina el contratista con todos sus carnets e imágenes (solo admin). */
export async function deleteContractor(id: string): Promise<void> {
  const cards = await getDocs(query(cardsCol(), where("contractorId", "==", id)));
  allCardsCache.clear();
  // Máximo 500 operaciones por lote: 2 por carnet.
  for (let i = 0; i < cards.docs.length; i += 200) {
    const batch = writeBatch(db());
    for (const c of cards.docs.slice(i, i + 200)) {
      batch.delete(imagesDoc(c.id));
      batch.delete(c.ref);
    }
    await batch.commit();
  }
  const batch = writeBatch(db());
  batch.delete(doc(contractorsCol(), id));
  await batch.commit();
}

/* ---------- Carnets ---------- */

/** Lista los carnets de un contratista (solo documentos livianos, nunca images). */
export function watchCards(
  contractor: Pick<Contractor, "id" | "groupId">,
  cb: (list: Card[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(cardsQuery(contractor),
    (snap) => cb(snap.docs.map(toCard).sort(byNewest)),
    onError,
  );
}

/** Consulta de carnets de un contratista. Incluye el grupo para cumplir las reglas. */
function cardsQuery(contractor: Pick<Contractor, "id" | "groupId">) {
  return contractor.groupId
    ? query(cardsCol(), where("contractorId", "==", contractor.id), where("groupId", "==", contractor.groupId))
    : query(cardsCol(), where("contractorId", "==", contractor.id));
}

export async function listCards(contractor: Pick<Contractor, "id" | "groupId">): Promise<Card[]> {
  const snap = await getDocs(cardsQuery(contractor));
  return snap.docs.map(toCard).sort(byNewest);
}

const allCardsCache = new Map<string, Promise<Card[]>>();

/** Todos los carnets (livianos) de un grupo, para el buscador de inicio. Se cachea por sesión. */
export function getAllCards(groupId: string): Promise<Card[]> {
  let p = allCardsCache.get(groupId);
  if (!p) {
    p = getDocs(query(cardsCol(), where("groupId", "==", groupId)))
      .then((s) => s.docs.map(toCard).sort(byName))
      .catch((e) => {
        allCardsCache.delete(groupId);
        throw e;
      });
    allCardsCache.set(groupId, p);
  }
  return p;
}

export async function getCard(id: string): Promise<Card | null> {
  const s = await getDoc(doc(cardsCol(), id));
  return s.exists() ? toCard(s) : null;
}

export async function getCardImages(id: string): Promise<CardImages | null> {
  const s = await getDoc(imagesDoc(id));
  if (!s.exists()) return null;
  const d = s.data();
  return { front: String(d.front ?? ""), back: String(d.back ?? "") };
}

/** Guarda el carnet liviano + images/main en una sola escritura por lotes. */
export async function saveCard(input: {
  groupId: string;
  contractorId: string;
  name: string;
  rut: string | null;
  thumb: string;
  images: CardImages;
  uid: string;
  username: string;
}): Promise<string> {
  const ref = doc(cardsCol());
  const batch = writeBatch(db());
  batch.set(ref, {
    groupId: input.groupId,
    contractorId: input.contractorId,
    name: input.name.trim(),
    rut: input.rut,
    thumb: input.thumb,
    createdAt: serverTimestamp(),
    createdBy: input.uid,
    createdByName: input.username,
  });
  batch.set(imagesDoc(ref.id), { front: input.images.front, back: input.images.back });
  batch.update(doc(contractorsCol(), input.contractorId), { cardCount: increment(1) });
  await batch.commit();
  allCardsCache.delete(input.groupId);
  return ref.id;
}

/** Corrige el nombre y el RUT de un carnet (usuarios del grupo y admins). */
export async function updateCard(id: string, data: { name: string; rut: string | null }, username: string): Promise<void> {
  await updateDoc(doc(cardsCol(), id), {
    name: data.name.trim(),
    rut: data.rut,
    updatedAt: serverTimestamp(),
    updatedByName: username,
  });
  allCardsCache.clear();
}

/** Vacía la carpeta: borra todos los carnets e imágenes del contratista (solo admin). */
export async function emptyContractor(
  contractor: Pick<Contractor, "id" | "groupId">,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const cards = await getDocs(cardsQuery(contractor));
  const total = cards.docs.length;
  onProgress?.(0, total);
  // Máximo 500 operaciones por lote: 2 por carnet.
  for (let i = 0; i < total; i += 200) {
    const batch = writeBatch(db());
    for (const c of cards.docs.slice(i, i + 200)) {
      batch.delete(imagesDoc(c.id));
      batch.delete(c.ref);
    }
    await batch.commit();
    onProgress?.(Math.min(i + 200, total), total);
  }
  const batch = writeBatch(db());
  batch.update(doc(contractorsCol(), contractor.id), { cardCount: 0 });
  await batch.commit();
  allCardsCache.clear();
}

/** Elimina el carnet y su images/main. */
export async function deleteCard(card: Pick<Card, "id" | "contractorId">): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(imagesDoc(card.id));
  batch.delete(doc(cardsCol(), card.id));
  batch.update(doc(contractorsCol(), card.contractorId), { cardCount: increment(-1) });
  await batch.commit();
  allCardsCache.clear();
}

/* ---------- Datos sin grupo (anteriores a los grupos) ---------- */

/** Contratistas sin grupo (solo admin). */
export async function listUngroupedContractors(): Promise<Contractor[]> {
  const snap = await getDocs(contractorsCol());
  return snap.docs.map(toContractor).filter((c) => !c.groupId);
}

/** Asigna a un grupo todos los contratistas sin grupo y sus carnets (solo admin). */
export async function assignUngroupedTo(groupId: string): Promise<number> {
  const contractors = await listUngroupedContractors();
  const ops: { ref: ReturnType<typeof doc> }[] = [];
  for (const c of contractors) {
    ops.push({ ref: doc(contractorsCol(), c.id) });
    const cards = await getDocs(query(cardsCol(), where("contractorId", "==", c.id)));
    cards.docs.forEach((d) => ops.push({ ref: d.ref }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db());
    ops.slice(i, i + 400).forEach((o) => batch.update(o.ref, { groupId }));
    await batch.commit();
  }
  allCardsCache.clear();
  return contractors.length;
}
