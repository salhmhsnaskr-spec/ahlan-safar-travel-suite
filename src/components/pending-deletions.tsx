import { AlertTriangle, RotateCw } from "lucide-react";
import { usePendingDeletions, useRetryDeletion } from "@/lib/data/context";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain";

/** Shows deletions whose database rows are gone but whose files Storage has not yet confirmed as removed. */
export function PendingDeletions() {
  const jobs = usePendingDeletions();
  const retry = useRetryDeletion();
  if (!jobs.data?.length) return null;
  return (
    <section role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> عمليات حذف معلقة</p>
      <ul className="space-y-2">
        {jobs.data.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{j.kind === "customer" ? "حذف عميل" : "حذف وثيقة"} · {formatDateTime(j.created_at)} · بقي {j.remaining.length} ملف · محاولات: {j.attempts}</span>
            <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(j.id)}><RotateCw /> إعادة المحاولة</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
