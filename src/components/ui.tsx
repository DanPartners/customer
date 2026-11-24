"use client";

export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{children}</p>;
}

export function Button({
  variant = "ink",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ink" | "accent" | "line" | "ghost" }) {
  const styles = {
    ink: "bg-ink text-paper hover:opacity-90",
    accent: "bg-accent text-on-accent hover:bg-accent-deep",
    line: "border border-rule bg-paper-raised text-ink hover:bg-paper-deep",
    ghost: "text-ink hover:bg-paper-deep",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-4 text-center font-display text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...props}
        className="mt-1 min-h-12 w-full border border-rule bg-paper-raised px-3 text-lg text-ink outline-none"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-accent-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A message in the page's flow, for errors and notes. */
export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "alert" }) {
  return (
    <p className={`border-l-2 pl-3 text-sm ${tone === "alert" ? "border-accent" : "border-rule text-ink-soft"}`} role={tone === "alert" ? "alert" : undefined}>
      {children}
    </p>
  );
}
