import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useActivity, useData, useMembers, usePaths } from "@/lib/data/context";
import { EmptyState, NativeSelect, PageHeader, ReadState } from "@/components/kit";
import { activityActionLabels, activityEntityLabels, bookingStatusLabels, formatDateTime, statusLabels, taskStatusLabels } from "@/lib/domain";

const statusText = (entity: string, s: string) =>
  (entity === "bookings" ? bookingStatusLabels : entity === "tasks" ? taskStatusLabels : statusLabels)[s as never] ?? s;

export function ActivityPage({ actorId, embedded = false }: { actorId?: string; embedded?: boolean } = {}) {
  const p = usePaths();
  const api = useData();
  const activity = useActivity(actorId);
  const memberQuery = useMembers();
  const members = new Map((memberQuery.data ?? []).map((m) => [m.user_id, m.full_name || m.email || "—"]));
  const [entity, setEntity] = useState("");
  const list = (activity.data ?? []).filter((a) => (!entity || a.entity === entity) && (api.role === "admin" || a.actor_id === api.userId));
  return (
    <>
      {!embedded && <PageHeader title={api.role === "admin" ? "سجل النشاط" : "نشاطي"} subtitle="آخر 200 عملية مسجلة" />}
      <NativeSelect aria-label="نوع العنصر" className="mb-4 w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
        <option value="">كل العناصر</option>
        {Object.entries(activityEntityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </NativeSelect>
      <ReadState queries={[activity, memberQuery]} title="تعذّر تحميل النشاط">
      {list.length === 0 ? <EmptyState title="لا يوجد نشاط بعد" /> : (
        <ol className="divide-y rounded-xl border bg-card">
          {list.map((a) => {
            const [label, extra] = (a.summary ?? "").split("|");
            const link = a.action !== "deleted" && a.entity_id
              ? a.entity === "customers" ? <Link to={p.customer} params={{ id: a.entity_id }} className="text-primary">{label}</Link>
              : a.entity === "bookings" ? <Link to={p.booking} params={{ id: a.entity_id }} className="text-primary" dir="ltr">{label}</Link>
              : <span dir="auto">{label}</span>
              : <span dir="auto">{label}</span>;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <p>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{activityActionLabels[a.action] ?? a.action}</span>{" "}
                  {activityEntityLabels[a.entity] ?? a.entity}: {link}
                  {extra && <> ← <b>{statusText(a.entity, extra)}</b></>}
                </p>
                <p className="text-xs text-muted-foreground">{members.get(a.actor_id ?? "") ?? "—"} · {formatDateTime(a.created_at)}</p>
              </li>
            );
          })}
        </ol>
      )}
      </ReadState>
    </>
  );
}
