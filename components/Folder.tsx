import Link from "next/link";
import type { Contractor } from "@/lib/db";

/** Carpeta de un contratista, con pestaña. */
export function Folder({ contractor }: { contractor: Contractor }) {
  const n = contractor.cardCount;
  return (
    <Link
      href={`/contratista?id=${contractor.id}`}
      className="group block transition active:scale-[0.97]"
      aria-label={`${contractor.name}, ${n} ${n === 1 ? "carnet" : "carnets"}`}
    >
      <div className="h-3 w-2/5 rounded-t-lg bg-accent/85" />
      <div className="flex aspect-[4/3] flex-col justify-between rounded-tr-xl rounded-b-xl bg-card p-4 shadow-sm ring-1 ring-line/60 group-hover:ring-accent/50">
        <div className="h-1.5 w-full rounded-full bg-accent/85" />
        <div>
          <p className="line-clamp-2 text-base leading-snug font-semibold break-words">{contractor.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            {n} {n === 1 ? "carnet" : "carnets"}
          </p>
        </div>
      </div>
    </Link>
  );
}
