"use client";

import Link from "next/link";
import type { ReactNode, SVGProps } from "react";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
  dark: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-base font-semibold text-paper transition active:scale-[0.98] disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-base font-medium transition active:scale-[0.98] disabled:opacity-50",
  ghost:
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-base font-medium transition active:bg-line/60 disabled:opacity-50",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent/40 bg-card px-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50",
};

export const input =
  "min-h-11 w-full rounded-xl border border-line bg-card px-4 text-base text-ink outline-none placeholder:text-muted focus:border-ink";

type IconProps = SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 22,
  height: 22,
  "aria-hidden": true,
  ...p,
});

export const Icon = {
  back: (p: IconProps) => (<svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>),
  plus: (p: IconProps) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>),
  search: (p: IconProps) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>),
  download: (p: IconProps) => (<svg {...base(p)}><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>),
  share: (p: IconProps) => (<svg {...base(p)}><path d="M12 15V4m0 0L8 8m4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg>),
  trash: (p: IconProps) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" /></svg>),
  edit: (p: IconProps) => (<svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>),
  camera: (p: IconProps) => (<svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>),
  rotate: (p: IconProps) => (<svg {...base(p)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>),
  image: (p: IconProps) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>),
  close: (p: IconProps) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>),
  more: (p: IconProps) => (<svg {...base(p)}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>),
  logout: (p: IconProps) => (<svg {...base(p)}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>),
  file: (p: IconProps) => (<svg {...base(p)}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>),
  gear: (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>),
  check: (p: IconProps) => (<svg {...base(p)}><path d="m5 12 5 5 9-10" /></svg>),
};

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function PageHeader({
  title,
  backHref,
  actions,
  subtitle,
}: {
  title: ReactNode;
  backHref?: string;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 bg-paper/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
      <div className="flex min-h-12 items-center gap-1">
        {backHref && (
          <Link href={backHref} className={`${btn.ghost} -ml-3`} aria-label="Volver">
            <Icon.back />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Icon.search className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${input} pl-11`}
        autoComplete="off"
      />
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-accent/10 px-4 py-3 text-accent">{children}</p>;
}
