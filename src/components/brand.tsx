import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" className="fill-primary" />
      <path d="M8 26c6-1 10-5 13-11 2 5 5 8 11 9" className="stroke-accent" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="27" cy="12" r="3.2" className="fill-accent" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className={cn("block font-display text-lg font-bold", light ? "text-sidebar-foreground" : "text-foreground")}>أهلًا سفر</span>
        <span className={cn("block text-[10px] tracking-[0.2em] uppercase", light ? "text-sidebar-foreground/60" : "text-muted-foreground")} dir="ltr">
          Ahlan Safar
        </span>
      </span>
    </span>
  );
}
