/** Acceso a Firestore según la sección 3 de CLAUDE.md. */
import {
  collection,
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
  name: string;
  cardCount: number;
  createdAt: Date | null;
};

export type Card = {
  id: string;
  contractorId: string;
  name: string;
  rut: string | null;
  thumb: string;
  createdAt: Date | null;
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
    name: String(d.name ?? ""),
    cardCount: Math.max(0, Number(d.cardCount ?? 0)),
    createdAt: toDate(d.createdAt),
  };
}

function toCard(s: QueryDocumentSnapshot | DocumentSnapshot): Card {
  const d = s.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: s.id,
    contractorId: String(d.contractorId ?? ""),
    name: String(d.name ?? ""),
    rut: d.rut ? String(d.rut) : null,
    thumb: String(d.thumb ?? ""),
    createdAt: toDate(d.createdAt),
  };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "es", { sensitivity: "base" });
const byNewest = (a: Card, b: Card) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);

/* ---------- Contratistas ---------- */

export function watchContractors(cb: (list: Contractor[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    contractorsCol(),
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

export async function createContractor(name: string, uid: string): Promise<string> {
  const ref = doc(contractorsCol());
  const batch = writeBatch(db());
  batch.set(ref, { name: name.trim(), cardCount: 0, createdAt: serverTimestamp(), createdBy: uid });
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
export function watchCards(contractorId: string, cb: (list: Card[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(cardsCol(), where("contractorId", "==", contractorId)),
    (snap) => cb(snap.docs.map(toCard).sort(byNewest)),
    onError,
  );
}

export async function listCards(contractorId: string): Promise<Card[]> {
  const snap = await getDocs(query(cardsCol(), where("contractorId", "==", contractorId)));
  return snap.docs.map(toCard).sort(byNewest);
}

let allCardsCache: Promise<Card[]> | null = null;

/** Todos los carnets (livianos), para el buscador de inicio. Se cachea por sesión. */
export function getAllCards(refresh = false): Promise<Card[]> {
  if (refresh || !allCardsCache) {
    allCardsCache = getDocs(cardsCol())
      .then((s) => s.docs.map(toCard).sort(byName))
      .catch((e) => {
        allCardsCache = null;
        throw e;
      });
  }
  return allCardsCache;
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
  contractorId: string;
  name: string;
  rut: string | null;
  thumb: string;
  images: CardImages;
  uid: string;
}): Promise<string> {
  const ref = doc(cardsCol());
  const batch = writeBatch(db());
  batch.set(ref, {
    contractorId: input.contractorId,
    name: input.name.trim(),
    rut: input.rut,
    thumb: input.thumb,
    createdAt: serverTimestamp(),
    createdBy: input.uid,
  });
  batch.set(imagesDoc(ref.id), { front: input.images.front, back: input.images.back });
  batch.update(doc(contractorsCol(), input.contractorId), { cardCount: increment(1) });
  await batch.commit();
  allCardsCache = null;
  return ref.id;
}

/** Elimina el carnet y su images/main. */
export async function deleteCard(card: Pick<Card, "id" | "contractorId">): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(imagesDoc(card.id));
  batch.delete(doc(cardsCol(), card.id));
  batch.update(doc(contractorsCol(), card.contractorId), { cardCount: increment(-1) });
  await batch.commit();
  allCardsCache = null;
}
