"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getGroup, listGroups, type Group } from "@/lib/users";
import { useAllowedUser } from "./AuthProvider";

type GroupContextValue = {
  /** Grupos visibles: todos para el admin, el propio para un usuario. null = cargando. */
  groups: Group[] | null;
  /** Grupo con el que se trabaja ahora (el admin lo elige). */
  group: Group | null;
  setGroupId: (id: string) => void;
  reload: () => void;
};

const GroupContext = createContext<GroupContextValue | null>(null);
const KEY = "carnets.group";

export function GroupProvider({ children }: { children: ReactNode }) {
  const { isAdmin, ownGroupId } = useAllowedUser();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = isAdmin ? listGroups() : getGroup(ownGroupId!).then((g) => (g ? [g] : []));
    load.then((g) => alive && setGroups(g)).catch(() => alive && setGroups([]));
    return () => {
      alive = false;
    };
  }, [isAdmin, ownGroupId, version]);

  const setGroupId = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, []);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const group = !groups
    ? null
    : isAdmin
      ? (groups.find((g) => g.id === selected) ?? groups[0] ?? null)
      : (groups[0] ?? null);

  return <GroupContext.Provider value={{ groups, group, setGroupId, reload }}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroup debe usarse dentro de <GroupProvider>");
  return ctx;
}
