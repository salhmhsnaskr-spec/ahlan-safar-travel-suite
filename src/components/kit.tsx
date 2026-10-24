import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { statusLabels, statusTone, type RequestStatus } from "@/lib/domain";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { readState, retryFailedReads, type ReadQuery } from "@/lib/query-state";

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", statusTone[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <p className="font-display font-semibold">{title}</p>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return <div role="status" aria-live="polite" className="py-16 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>;
}

export function ReadState({ queries, title, children }: { queries: readonly ReadQuery[]; title: string; children: ReactNode }) {
  const state = readState(queries);
  if (state === "error") {
    const retrying = queries.some((q) => q.isError && q.isFetching);
    return (
      <div role="alert">
        <EmptyState title={title} body="لم تكتمل قراءة البيانات. أعد المحاولة؛ لا يعني ذلك عدم وجود سجلات."
          action={<Button variant="outline" disabled={retrying} onClick={() => void retryFailedReads(queries)}><RefreshCw className={retrying ? "animate-spin motion-reduce:animate-none" : ""} />{retrying ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}</Button>} />
      </div>
    );
  }
  if (state === "loading") return <Loading />;
  return <>{children}</>;
}
