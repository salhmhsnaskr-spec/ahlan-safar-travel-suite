import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Ban, Pencil, Plus, Search, Trash2, ListTodo } from "lucide-react";
import {
  useBookings, useCustomers, useData, useDeleteBooking, useMembers, usePaths, useRequests, useSaveBooking, useServices, useTasks,
} from "@/lib/data/context";
import { EmptyState, Field, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { BookingDialog, TaskDialog } from "@/components/forms-ops";
import { ConfirmDelete } from "@/components/confirm";
import { TaskList } from "@/components/pages/tasks";
import { DocumentsPanel } from "@/components/pages/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bookingCode, bookingStatusLabels, bookingStatusOrder, bookingStatusTone, formatDate, requestCode, type Booking, type BookingStatus,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function BookingBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", bookingStatusTone[status])}>
      <span className="size-1.5 rounded-full bg-current" />{bookingStatusLabels[status]}
    </span>
  );
}

function useLookups() {
  const customers = useCustomers().data ?? [];
  const services = useServices().data ?? [];
  const members = useMembers().data ?? [];
  const requests = useRequests().data ?? [];
  return {
    customer: new Map(customers.map((c) => [c.id, c.full_name])),
    service: new Map(services.map((s) => [s.id, s.name])),
    member: new Map(members.map((m) => [m.user_id, m.full_name || m.email || "—"])),
    request: new Map(requests.map((r) => [r.id, r])),
  };
}

export function BookingTable({ list, emptyTitle = "لا توجد حجوزات" }: { list: Booking[]; emptyTitle?: string }) {
  const p = usePaths();
  const L = useLookups();
  const save = useSaveBooking();
  if (list.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>{["الحجز", "العميل", "الخدمة", "الموظف", "موعد الخدمة", "الحالة"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {list.map((b) => (
            <tr key={b.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link to={p.booking} params={{ id: b.id }} className="font-mono text-xs font-semibold text-primary" dir="ltr">{bookingCode(b.number)}</Link>
                {b.external_ref && <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{b.external_ref}</p>}
              </td>
              <td className="px-4 py-3"><Link to={p.customer} params={{ id: b.customer_id }} className="hover:text-primary">{L.customer.get(b.customer_id) ?? "—"}</Link></td>
              <td className="px-4 py-3">{L.service.get(b.service_id ?? "") ?? "—"}</td>
              <td className="px-4 py-3">{b.assigned_employee_id ? L.member.get(b.assigned_employee_id) ?? "—" : "—"}</td>
              <td className="px-4 py-3">{formatDate(b.service_date)}</td>
              <td className="px-4 py-3">
                <NativeSelect
                  aria-label="تغيير حالة الحجز"
                  className={cn("h-8 w-auto text-xs font-medium ring-1 ring-inset", bookingStatusTone[b.status])}
                  value={b.status}
                  onChange={(e) => save.mutate({ id: b.id, customer_id: b.customer_id, status: e.target.value as BookingStatus })}
                >
                  {bookingStatusOrder.map((s) => <option key={s} value={s}>{bookingStatusLabels[s]}</option>)}
                </NativeSelect>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BookingsPage() {
  const { data, isLoading } = useBookings();
  const search = useSearch({ strict: false }) as { service?: string; status?: string; when?: string };
  const services = useServices().data ?? [];
  const members = useMembers().data ?? [];
  const L = useLookups();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(search.status ?? "");
  const [service, setService] = useState(search.service ?? "");
  const [emp, setEmp] = useState("");
  const [from, setFrom] = useState(search.when === "today" ? new Date().toISOString().slice(0, 10) : "");
  const [to, setTo] = useState(search.when === "today" ? new Date().toISOString().slice(0, 10) : "");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const all = data ?? [];
  const t = q.trim().toLowerCase();
  const list = all
    .filter((b) => {
      if (status && b.status !== status) return false;
      if (service && b.service_id !== service) return false;
      if (emp && b.assigned_employee_id !== emp) return false;
      if (from && (!b.service_date || b.service_date < from)) return false;
      if (to && (!b.service_date || b.service_date > to)) return false;
      if (t && ![bookingCode(b.number), b.external_ref, b.provider, L.customer.get(b.customer_id)].some((x) => x?.toLowerCase().includes(t))) return false;
      return true;
    })
    .sort((a, b) => {
      const x = a.service_date ?? a.created_at, y = b.service_date ?? b.created_at;
      return (x < y ? -1 : x > y ? 1 : 0) * (order === "asc" ? 1 : -1);
    });

  return (
    <>
      <PageHeader title="الحجوزات" subtitle={`${all.length} حجز في مكتبك`} actions={<Button onClick={() => setOpen(true)}><Plus /> حجز جديد</Button>} />
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-4">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder="ابحث برقم الحجز أو المرجع أو اسم العميل أو المزود" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Field label="الحالة"><NativeSelect aria-label="فلترة الحالة" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">الكل</option>{bookingStatusOrder.map((s) => <option key={s} value={s}>{bookingStatusLabels[s]}</option>)}</NativeSelect></Field>
        <Field label="الخدمة"><NativeSelect aria-label="فلترة الخدمة" value={service} onChange={(e) => setService(e.target.value)}><option value="">الكل</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="الموظف"><NativeSelect aria-label="فلترة الموظف" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">الكل</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect></Field>
        <Field label="الترتيب حسب التاريخ"><NativeSelect aria-label="الترتيب" value={order} onChange={(e) => setOrder(e.target.value as "asc" | "desc")}><option value="desc">الأحدث أولًا</option><option value="asc">الأقدم أولًا</option></NativeSelect></Field>
        <Field label="من تاريخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {isLoading ? <Loading /> : <BookingTable list={list} />}
      <BookingDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function BookingDetailPage({ id }: { id: string }) {
  const p = usePaths();
  const api = useData();
  const navigate = useNavigate();
  const bookings = useBookings();
  const tasks = (useTasks().data ?? []).filter((t) => t.booking_id === id);
  const L = useLookups();
  const save = useSaveBooking();
  const del = useDeleteBooking();
  const [edit, setEdit] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [remove, setRemove] = useState(false);
  if (bookings.isLoading) return <Loading />;
  const b = bookings.data?.find((x) => x.id === id);
  if (!b) return <EmptyState title="الحجز غير موجود" action={<Link to={p.bookings} className="text-primary">العودة إلى الحجوزات</Link>} />;
  const req = b.request_id ? L.request.get(b.request_id) : undefined;
  const info: [string, React.ReactNode][] = [
    ["العميل", <Link to={p.customer} params={{ id: b.customer_id }} className="text-primary">{L.customer.get(b.customer_id) ?? "—"}</Link>],
    ["الخدمة", L.service.get(b.service_id ?? "") ?? "—"],
    ["الطلب المرتبط", req ? <span dir="ltr">{requestCode(req.number)}</span> : "—"],
    ["الموظف المسؤول", b.assigned_employee_id ? L.member.get(b.assigned_employee_id) ?? "—" : "—"],
    ["موعد الخدمة", formatDate(b.service_date)],
    ["تاريخ إنشاء الحجز", formatDate(b.created_at)],
    ["المرجع الخارجي", b.external_ref ? <span dir="ltr">{b.external_ref}</span> : "—"],
    ["مزود الخدمة", b.provider || "—"],
  ];
  return (
    <>
      <Link to={p.bookings} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> الحجوزات</Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold"><span dir="ltr">{bookingCode(b.number)}</span><BookingBadge status={b.status} /></h1>
          <p className="text-sm text-muted-foreground">آخر تحديث {formatDate(b.updated_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeSelect aria-label="تغيير حالة الحجز" className="w-auto" value={b.status} onChange={(e) => save.mutate({ id: b.id, customer_id: b.customer_id, status: e.target.value as BookingStatus })}>
            {bookingStatusOrder.map((s) => <option key={s} value={s}>{bookingStatusLabels[s]}</option>)}
          </NativeSelect>
          <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> تعديل</Button>
          {api.role === "admin" && <Button variant="outline" onClick={() => setNewTask(true)}><ListTodo /> مهمة للحجز</Button>}
          {b.status !== "cancelled" && <Button variant="outline" className="text-danger" onClick={() => setCancel(true)}><Ban /> إلغاء الحجز</Button>}
          {api.role === "admin" && <Button variant="ghost" size="icon" aria-label="حذف" className="text-danger" onClick={() => setRemove(true)}><Trash2 /></Button>}
        </div>
      </div>
      <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
        {info.map(([k, v]) => <div key={k} className="bg-card px-4 py-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 text-sm font-medium">{v}</dd></div>)}
      </dl>
      {b.notes && <div className="mt-4 whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm">{b.notes}</div>}
      <h2 className="mb-3 mt-8 font-semibold">المهام المرتبطة بالحجز</h2>
      <TaskList list={tasks} emptyTitle="لا توجد مهام لهذا الحجز" />
      <h2 className="mb-3 mt-8 font-semibold">وثائق الحجز</h2>
      <DocumentsPanel links={{ booking_id: b.id, customer_id: b.customer_id }} filter={(d) => d.booking_id === b.id} />
      <BookingDialog open={edit} onOpenChange={setEdit} initial={b} />
      <TaskDialog open={newTask} onOpenChange={setNewTask} initial={newTask ? { booking_id: b.id, customer_id: b.customer_id, service_id: b.service_id, task_type: "booking_confirmation", title: `متابعة الحجز ${bookingCode(b.number)}` } : null} />
      <ConfirmDelete open={cancel} onOpenChange={setCancel} title="إلغاء الحجز؟" body="ستتغير حالة الحجز إلى «ملغي» ويبقى محفوظًا في السجل."
        confirmLabel="تأكيد الإلغاء" onConfirm={() => save.mutate({ id: b.id, customer_id: b.customer_id, status: "cancelled" }, { onSuccess: () => setCancel(false) })} />
      <ConfirmDelete open={remove} onOpenChange={setRemove} title="حذف الحجز نهائيًا؟" body="لا يمكن التراجع عن هذه العملية."
        onConfirm={() => del.mutate(b.id, { onSuccess: () => navigate({ to: p.bookings }) })} />
    </>
  );
}
