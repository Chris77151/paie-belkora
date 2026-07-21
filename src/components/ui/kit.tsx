import * as React from "react";
import { cn } from "@/lib/cn";
import type { PeriodStatus, Severity } from "@/data/types";

/* ---------- Card ---------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border bg-card text-card-foreground shadow-card", className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold font-sans tracking-normal", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

/* ---------- Button ---------- */
type BtnVariant = "primary" | "outline" | "ghost" | "sage" | "destructive";
type BtnSize = "sm" | "md" | "icon";
export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  const variants: Record<BtnVariant, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 shadow-sm",
    sage: "bg-sage text-sage-foreground hover:bg-sage/90 active:bg-sage/95 shadow-sm",
    outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground hover:border-border active:bg-accent/70",
    ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
  };
  const sizes: Record<BtnSize, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Badge ---------- */
export function Badge({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "primary" | "sage" | "warning" | "success" | "destructive" }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-accent text-accent-foreground",
    sage: "bg-sage/15 text-sage",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/12 text-destructive",
  } as const;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

const STATUS_LABEL: Record<PeriodStatus, string> = {
  draft: "Brouillon",
  validated: "Validée",
  declared: "Déclarée",
  paid: "Payée",
};
export function StatusBadge({ status }: { status: PeriodStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `hsl(var(--status-${status}) / 0.14)`, color: `hsl(var(--status-${status}))` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(var(--status-${status}))` }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
export function severityTone(s: Severity): "muted" | "warning" | "destructive" {
  return s === "critical" ? "destructive" : s === "warning" ? "warning" : "muted";
}

/* ---------- Form ---------- */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors",
        "hover:border-muted-foreground/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "placeholder:text-muted-foreground/60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed transition-colors",
        "hover:border-muted-foreground/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "placeholder:text-muted-foreground/60 resize-y",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors cursor-pointer",
        "hover:border-muted-foreground/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Table ---------- */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table className={cn("w-full text-sm border-collapse", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "text-left font-medium text-xs uppercase tracking-wide text-muted-foreground px-3 py-2.5 border-b",
        className,
      )}
      {...props}
    />
  );
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 border-b border-border/60 align-middle", className)} {...props} />;
}

/* ---------- Page header ---------- */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/* ---------- KPI ---------- */
export function Kpi({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "sage" | "gold" | "destructive";
}) {
  const ring = {
    primary: "text-primary bg-accent",
    sage: "text-sage bg-sage/12",
    gold: "text-gold bg-gold/12",
    destructive: "text-destructive bg-destructive/12",
  }[accent ?? "primary"];
  return (
    <Card className="card-grad">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold num text-foreground">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {icon && <div className={cn("grid h-10 w-10 place-items-center rounded-lg", ring)}>{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
