/** Usuarios de la app: cada persona tiene su usuario y todos usan una contraseña común. */
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db, firebaseApp } from "./firebase";

export type Role = "admin" | "user";
export type AppUser = { uid: string; username: string; role: Role; active: boolean };

/** Dominio interno: Firebase necesita un correo, el usuario solo ve su nombre. */
const DOMAIN = "usuarios.carnets.app";

export const MIN_PASSWORD = 8;

/** "Juan.Pérez " → "juan.perez" (solo letras, números, punto, guion y guion bajo). */
export function normalizeUsername(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,29}$/.test(u);
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  return (email ?? "").split("@")[0];
}

const usersCol = () => collection(db(), "users");

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(usersCol());
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        username: String(x.username ?? ""),
        role: (x.role === "admin" ? "admin" : "user") as Role,
        active: x.active !== false,
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username, "es"));
}

/**
 * Crea un usuario (solo admin). Usa una instancia secundaria de Firebase para no
 * cerrar la sesión del admin. Si la cuenta ya existía, la vincula con la contraseña común.
 */
export async function createAppUser(rawUsername: string, role: Role, commonPassword: string): Promise<void> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) throw new UserError("Usuario no válido: usa de 2 a 30 letras o números, sin espacios.");
  const email = usernameToEmail(username);
  const secondary = initializeApp(firebaseApp().options, `crear-${Date.now()}`);
  try {
    const auth = getAuth(secondary);
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    let uid: string;
    try {
      uid = (await createUserWithEmailAndPassword(auth, email, commonPassword)).user.uid;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        try {
          uid = (await signInWithEmailAndPassword(auth, email, commonPassword)).user.uid;
        } catch {
          throw new UserError("Ese usuario ya existe con otra contraseña.");
        }
      } else if (code === "auth/weak-password") {
        throw new UserError(`La contraseña común debe tener al menos ${MIN_PASSWORD} caracteres.`);
      } else {
        throw err;
      }
    }
    await signOut(auth).catch(() => undefined);
    await setDoc(doc(usersCol(), uid), { username, role, active: true, createdAt: serverTimestamp() });
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
}

export async function setUserActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(usersCol(), uid), { active });
}

export async function setUserRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(usersCol(), uid), { role });
}

/** Error con mensaje para mostrar al usuario. */
export class UserError extends Error {}
