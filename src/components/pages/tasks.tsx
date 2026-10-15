import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plane, Plus, Search, Trash2 } from "lucide-react";
import { useBookings, useCustomers, useData, useDeleteTask, useMembers, usePaths, useSaveTask, useTasks } from "@/lib/data/context";
import { EmptyState, Field, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { TaskDialog } from "@/components/forms-ops";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bookingCode, formatDateTime, isOpenTask, taskPriorityLabels, taskPriorityTone, taskStatusLabels, taskStatusOrder, taskStatusTone, taskTypeLabels,
  type Task, type TaskStatus,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function TaskList({ list, emptyTitle = "لا توجد مهام" }: { list: Task[]; emptyTitle?: string }) {
  const api = useData();
  const p = usePaths();
  const isAdmin = api.role === "admin";
  const customers = new Map((useCustomers().data ?? []).map((c) => [c.id, c.full_name]));
  const members = new Map((useMembers().data ?? []).map((m) => [m.user_id, m.full_name || m.email || "—"]));
  const bookings = new Map((useBookings().data ?? []).map((b) => [b.id, b]));
  const save = useSaveTask();
  const del = useDeleteTask();
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const now = new Date().toISOString();
  if (list.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((t) => {
          const overdue = isOpenTask(t.status) && t.due_at && t.due_at < now;
          const bk = t.booking_id ? bookings.get(t.booking_id) : undefined;
          const canUpdate = isAdmin || t.assigned_to === api.userId;
          return (
            <div key={t.id} className={cn("rounded-xl border bg-card p-4", overdue && "border-danger/50")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{taskTypeLabels[t.task_type]} · <span className={cn("font-medium", taskPriorityTone[t.priority])}>أولوية {taskPriorityLabels[t.priority]}</span></p>
                  <p className="mt-1 font-semibold">{t.title}</p>
                </div>
                {overdue && <span className="shrink-0 rounded-full bg-danger/12 px-2 py-0.5 text-[11px] font-medium text-danger">متأخرة</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>الاستحقاق: <b className="text-foreground">{formatDateTime(t.due_at)}</b></span>
                <span>المسؤول: <b className="text-foreground">{t.assigned_to ? members.get(t.assigned_to) ?? "—" : "غير محدد"}</b></span>
                {t.customer_id && <span>العميل: <Link to={p.customer} params={{ id: t.customer_id }} className="text-primary">{customers.get(t.customer_id) ?? "—"}</Link></span>}
                {bk && <span>الحجز: <Link to={p.booking} params={{ id: bk.id }} className="text-primary" dir="ltr">{bookingCode(bk.number)}</Link></span>}
              </div>
              {t.task_type === "airport_pickup" && (t.flight_number || t.airport) && (
                <p className="mt-2 flex items-center gap-1.5 text-xs"><Plane className="size-3.5 text-primary" /> <span dir="ltr">{t.flight_number}</span> · {t.airport} · {formatDateTime(t.arrival_at)}</p>
              )}
              {t.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{t.notes}</p>}
              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                <NativeSelect
                  aria-label="تغيير حالة المهمة" disabled={!canUpdate}
                  className={cn("h-8 w-auto text-xs font-medium ring-1 ring-inset", taskStatusTone[t.status])}
                  value={t.status}
                  onChange={(e) => save.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                >
                  {taskStatusOrder.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
                </NativeSelect>
                <div className="ms-auto flex gap-1">
                  {canUpdate && <Button size="icon" variant="ghost" aria-label="تعديل المهمة" onClick={() => setEditing(t)}><Pencil /></Button>}
                  {isAdmin && <Button size="icon" variant="ghost" aria-label="حذف المهمة" className="text-danger" onClick={() => setToDelete(t)}><Trash2 /></Button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <TaskDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing} />
      <ConfirmDelete open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="حذف المهمة؟" body="لا يمكن التراجع عن هذه العملية."
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })} />
    </>
  );
}

export function TasksPage() {
  const api = useData();
  const isAdmin = api.role === "admin";
  const { data, isLoading } = useTasks();
  const members = useMembers().data ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"open" | "mine" | "overdue" | "all">("open");
  const [status, setStatus] = useState("");
  const [emp, setEmp] = useState("");
  const all = data ?? [];
  const now = new Date().toISOString();
  const list = all.filter((t) => {
    if (scope === "open" && !isOpenTask(t.status)) return false;
    if (scope === "mine" && t.assigned_to !== api.userId) return false;
    if (scope === "overdue" && !(isOpenTask(t.status) && t.due_at && t.due_at < now)) return false;
    if (status && t.status !== status) return false;
    if (emp && t.assigned_to !== emp) return false;
    if (q.trim() && !t.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const scopes = [["open", "المفتوحة"], ["mine", "مهامي"], ["overdue", "المتأخرة"], ["all", "الكل"]] as const;
  return (
    <>
      <PageHeader
        title="المهام"
        subtitle={isAdmin ? "وزّع المهام التشغيلية على فريقك وتابع تنفيذها" : "المهام المسندة إليك"}
        actions={isAdmin && <Button onClick={() => setOpen(true)}><Plus /> مهمة جديدة</Button>}
      />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {scopes.map(([k, v]) => (
          <button key={k} onClick={() => setScope(k)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", scope === k ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{v}</button>
        ))}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9 bg-card" placeholder="ابحث في عناوين المهام" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Field label=""><NativeSelect aria-label="فلترة حالة المهمة" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{taskStatusOrder.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}</NativeSelect></Field>
        {isAdmin && <Field label=""><NativeSelect aria-label="فلترة الموظف" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">كل الموظفين</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect></Field>}
      </div>
      {isLoading ? <Loading /> : <TaskList list={list} />}
      <TaskDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
