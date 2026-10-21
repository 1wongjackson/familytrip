import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_1px_2px_rgba(15,40,50,0.05),0_12px_32px_-16px_rgba(15,60,70,0.25)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70 ${className}`}>
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-teal-700 to-teal-600 text-white shadow-md shadow-teal-900/20 hover:from-teal-800 hover:to-teal-700 active:scale-[0.98] disabled:from-stone-300 disabled:to-stone-300 disabled:shadow-none dark:disabled:from-stone-700 dark:disabled:to-stone-700",
  secondary:
    "border border-stone-200 bg-white/90 text-stone-800 hover:border-teal-300 hover:bg-teal-50/60 active:scale-[0.98] dark:border-white/10 dark:bg-slate-800/70 dark:text-stone-100 dark:hover:bg-slate-700/70",
  danger: "bg-rose-600 text-white shadow-md shadow-rose-900/20 hover:bg-rose-700 active:scale-[0.98]",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`min-h-11 rounded-2xl px-4 py-2 font-medium transition-all disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
    good: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    bad: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "good" }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
    good: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white/90 px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-stone-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
