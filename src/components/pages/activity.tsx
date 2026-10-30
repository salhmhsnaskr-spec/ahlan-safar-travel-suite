import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useActivity, useData, useMembers, usePaths } from "@/lib/data/context";
import { EmptyState, NativeSelect, PageHeader, ReadState } from "@/components/kit";
import { activityActionLabels, activityEntityLabels, bookingStatusLabels, formatDateTime, statusLabels, taskStatusLabels } from "@/lib/domain";
import { auditObject } from "@/lib/attribution";

const fieldLabels: Record<string, string> = { status: "الحالة", notes: "الملاحظات", service_details: "تفاصيل الخدمة", assigned_to: "الموظف المسؤول", assigned_employee_id: "الموظف المسؤول", created_by: "المنشئ", updated_by: "آخر معدّل", completed_by: "من أكمل", completed_at: "تاريخ الإكمال", cancelled_by: "من ألغى", cancelled_at: "تاريخ الإلغاء", updated_at: "تاريخ التعديل", customer_id: "العميل", request_id: "الطلب", booking_id: "الحجز", service_id: "الخدمة", priority: "الأولوية", service_date: "تاريخ الخدمة", due_at: "الموعد", title: "العنوان", full_name: "الاسم", passport_number: "رقم الجواز", phone: "الهاتف", email: "البريد" };

const statusText = (entity: string, s: string) =>
  (entity === "bookings" ? bookingStatusLabels : entity === "tasks" ? taskStatusLabels : statusLabels)[s as never] ?? s;

export function ActivityPage({ actorId, embedded = false }: { actorId?: string; embedded?: boolean } = {}) {
  const p = usePaths();
  const api = useData();
  const activity = useActivity(actorId);
  const memberQuery = useMembers();
  const members = new Map((memberQuery.data ?? []).map((m) => [m.user_id, m]));
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
            const old = auditObject(a.old_values);
            const next = auditObject(a.new_values);
            const member = members.get(a.actor_id ?? "");
            const actorName = a.actor_name || member?.full_name || member?.email || (a.actor_id ? "هوية محفوظة دون اسم" : "غير منسوب");
            const actorStatus = member?.status === "removed" ? " · موظف سابق" : member?.status === "suspended" ? " · موقوف" : "";
            const valueText = (key: string, value: unknown) => {
              if (value === null || value === undefined) return "—";
              if (key === "status") return statusText(a.entity, String(value));
              if (key.endsWith("_by") || key === "assigned_to" || key === "assigned_employee_id") {
                const person = members.get(String(value));
                return person?.full_name || person?.email || "هوية محفوظة";
              }
              return typeof value === "object" ? JSON.stringify(value) : String(value);
            };
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
                  {old['status'] !== undefined && next['status'] !== undefined && old['status'] !== next['status'] && <span className="ms-2 text-muted-foreground">{statusText(a.entity, String(old['status']))} ← {statusText(a.entity, String(next['status']))}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{actorName}{actorStatus} · {formatDateTime(a.created_at)}</p>
                <details className="w-full min-w-0">
                  <summary className="cursor-pointer text-xs text-primary">تفاصيل العملية</summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <p>النتيجة: {a.result === "success" ? "نجحت" : "غير مسجلة — سجل تاريخي"}</p>
                    {a.changed_fields?.length ? <p className="break-words text-muted-foreground">الحقول المتأثرة: {a.changed_fields.map((key) => fieldLabels[key] ?? key).join("، ")}</p> : null}
                    {a.old_values !== null || a.new_values !== null ? (
                      <dl className="grid gap-1">
                        {[...new Set([...Object.keys(old), ...Object.keys(next)])].filter((key) => JSON.stringify(old[key]) !== JSON.stringify(next[key])).map((key) => (
                          <div key={key} className="grid min-w-0 grid-cols-[1fr_2fr] gap-2 border-b py-1">
                            <dt className="break-words text-muted-foreground">{fieldLabels[key] ?? key}</dt>
                            <dd className="min-w-0 break-words" dir="auto">{valueText(key, old[key])} ← {valueText(key, next[key])}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : <p className="text-muted-foreground">القيم السابقة والجديدة غير متوفرة لهذا السجل التاريخي.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
      </ReadState>
    </>
  );
}
