"use client";

import { useAllowedUser, useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const { user, isAdmin } = useAllowedUser();
  const { signOut } = useAuth();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3 py-3">
        <h1 className="text-2xl font-bold">Contratistas</h1>
        <button
          type="button"
          onClick={() => signOut()}
          className="min-h-11 rounded-xl px-3 text-base text-muted"
        >
          Salir
        </button>
      </header>

      <section className="mt-4 rounded-2xl bg-card p-6">
        <p className="text-base">
          Hola, <span className="font-semibold">{user.displayName ?? user.email}</span>.
        </p>
        <p className="mt-1 text-sm text-muted">
          {user.email} · {isAdmin ? "Administrador" : "Usuario"}
        </p>
        <p className="mt-4 text-muted">Las carpetas de contratistas llegarán en la Fase 2.</p>
      </section>
    </div>
  );
}
