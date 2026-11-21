"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/lib/db";
import { listUsers } from "@/lib/users";
import { useAllowedUser } from "./AuthProvider";

let usersByUid: Promise<Map<string, string>> | null = null;

/** Mapa uid → usuario (solo admins; se carga una vez por sesión). */
function loadUsers(): Promise<Map<string, string>> {
  usersByUid ??= listUsers()
    .then((list) => new Map(list.map((u) => [u.uid, u.username])))
    .catch(() => {
      usersByUid = null;
      return new Map<string, string>();
    });
  return usersByUid;
}

/**
 * Solo para admins: devuelve una función que dice qué usuario registró un carnet.
 * Para carnets antiguos sin nombre guardado, lo busca por su uid. Para usuarios
 * normales devuelve null (no se muestra).
 */
export function useRegisteredBy(): ((card: Pick<Card, "createdBy" | "createdByName">) => string) | null {
  const { isAdmin } = useAllowedUser();
  const [users, setUsers] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    loadUsers().then((m) => alive && setUsers(m));
    return () => {
      alive = false;
    };
  }, [isAdmin]);
  if (!isAdmin) return null;
  return (card) => card.createdByName ?? (card.createdBy ? users?.get(card.createdBy) : undefined) ?? "—";
}
