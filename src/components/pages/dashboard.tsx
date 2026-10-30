import { Link } from "@tanstack/react-router";
import { ClipboardList, Users, CalendarCheck, Handshake, Plus, ArrowLeft, AlertTriangle, Clock, Flame, ListTodo, CalendarClock, Hourglass } from "lucide-react";
import { useState } from "react";
import { useBookings, useCustomers, useData, useMembers, usePartners, usePaths, useRequests, useServices, useTasks } from "@/lib/data/context";
import { BookingDialog } from "@/components/forms-ops";
import { PageHeader, StatusBadge, Loading } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { RequestDialog, CustomerDialog } from "@/components/forms";
import { bookingCode, bookingStatusLabels, formatDateTime, isOpenBooking, isOpenTask, localDay, todayStr, formatDate, isOpenStatus, requestCode, statusLabels, statusOrder, statusBar } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const p = usePaths();
  const customers = useCustomers();
  const requests = useRequests();
  const partners = usePartners().data ?? [];
  const services = useServices().data ?? [];
  const [reqOpen, setReqOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const api = useData();
  const bookings = useBookings().data ?? [];
  const tasks = useTasks().data ?? [];
  const members = new Map((useMembers().data ?? []).map((m) => [m.user_id, m.full_name || m.email || "—"]));
  if (customers.isLoading || requests.isLoading) return <Loading />;
  const today = todayStr();
  const nowIso = new Date().toISOString();
  const openTasks = tasks.filter((t) => isOpenTask(t.status));
  const myScope = api.role === "admin" ? openTasks : openTasks.filter((t) => t.assigned_to === api.userId);
  const ops = {
    upcoming: bookings.filter((b) => isOpenBooking(b.status) && b.service_date && b.service_date > today).sort((a, b) => (a.service_date! < b.service_date! ? -1 : 1)),
    today: bookings.filter((b) => b.service_date === today && b.status !== "cancelled"),
    awaiting: bookings.filter((b) => b.status === "awaiting_confirmation"),
    dueToday: myScope.filter((t) => t.due_at && localDay(t.due_at) === today),
    overdue: myScope.filter((t) => t.due_at && t.due_at < nowIso && localDay(t.due_at) !== today),
    high: myScope.filter((t) => t.priority === "high"),
    followup: (requests.data ?? []).filter((r) => r.status === "awaiting_customer" || r.status === "awaiting_approval" || r.status === "new"),
  };
  const opCards = [
    { label: "حجوزات اليوم", value: ops.today.length, icon: CalendarClock, to: p.bookings, search: { when: "today" }, tone: "text-primary" },
    { label: "حجوزات قادمة", value: ops.upcoming.length, icon: CalendarCheck, to: p.bookings, search: {}, tone: "text-info" },
    { label: "تنتظر التأكيد", value: ops.awaiting.length, icon: Hourglass, to: p.bookings, search: { status: "awaiting_confirmation" }, tone: "text-violet" },
    { label: "مهام مستحقة اليوم", value: ops.dueToday.length, icon: Clock, to: p.tasks, search: {}, tone: "text-warning" },
    { label: "مهام متأخرة", value: ops.overdue.length, icon: AlertTriangle, to: p.tasks, search: {}, tone: "text-danger" },
    { label: "مهام عالية الأولوية", value: ops.high.length, icon: Flame, to: p.tasks, search: {}, tone: "text-danger" },
    { label: "طلبات تحتاج متابعة", value: ops.followup.length, icon: ClipboardList, to: p.requests, search: {}, tone: "text-warning" },
  ];
  const attention = [...ops.overdue, ...ops.dueToday.filter((t) => !ops.overdue.includes(t))].slice(0, 6);
  const rs = requests.data ?? [];
  const cs = customers.data ?? [];
  const names = new Map(cs.map((c) => [c.id, c.full_name]));
  const svcNames = new Map(services.map((s) => [s.id, s.name]));
  const stats = [
    { label: "العملاء", value: cs.length, icon: Users, to: p.customers },
    { label: "طلبات مفتوحة", value: rs.filter((r) => isOpenStatus(r.status)).length, icon: ClipboardList, to: p.requests },
    { label: "الحجوزات", value: bookings.length, icon: CalendarCheck, to: p.bookings },
    ...(api.role === "admin" ? [{ label: "مكاتب شريكة نشطة", value: partners.filter((x) => x.status === "active").length, icon: Handshake, to: p.partners }] : []),
  ];
  const max = Math.max(1, ...statusOrder.map((s) => rs.filter((r) => r.status === s).length));

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة سريعة على نشاط المكتب اليوم"
        actions={
          <>
            <Button onClick={() => setReqOpen(true)}><Plus /> طلب جديد</Button>
            <Button variant="outline" onClick={() => setBookOpen(true)}><Plus /> حجز</Button>
            <Button variant="outline" onClick={() => setCustOpen(true)}><Plus /> عميل</Button>
          </>
        }
      />
      <h2 className="mb-3 font-semibold">المركز التشغيلي</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {opCards.map((c) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link key={c.label} to={c.to as any} search={c.search as never} className="rounded-xl border bg-card p-3 transition-shadow hover:shadow-md">
            <c.icon className={cn("size-4.5", c.tone)} />
            <p className="mt-2 font-display text-2xl font-bold">{c.value}</p>
            <p className="text-xs leading-tight text-muted-foreground">{c.label}</p>
          </Link>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><ListTodo className="size-4 text-primary" /> مهام تحتاج انتباهك</h2>
            <Link to={p.tasks} className="flex items-center gap-1 text-sm text-primary">الكل <ArrowLeft className="size-4" /></Link>
          </div>
          <ul className="divide-y">
            {attention.map((t) => (
              <li key={t.id}>
                <Link to={p.tasks} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.due_at)} · {t.assigned_to ? members.get(t.assigned_to) ?? "—" : "غير محدد"}</p>
                  </div>
                  {t.due_at && t.due_at < nowIso ? <span className="shrink-0 rounded-full bg-danger/12 px-2 py-0.5 text-[11px] text-danger">متأخرة</span> : <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">اليوم</span>}
                </Link>
              </li>
            ))}
            {attention.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">لا توجد مهام متأخرة أو مستحقة اليوم</li>}
          </ul>
        </section>
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarCheck className="size-4 text-primary" /> الحجوزات القريبة</h2>
            <Link to={p.bookings} className="flex items-center gap-1 text-sm text-primary">الكل <ArrowLeft className="size-4" /></Link>
          </div>
          <ul className="divide-y">
            {[...ops.today, ...ops.upcoming].slice(0, 6).map((b) => (
              <li key={b.id}>
                <Link to={p.booking} params={{ id: b.id }} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{names.get(b.customer_id) ?? "—"} · {svcNames.get(b.service_id ?? "") ?? "خدمة"}</p>
                    <p className="text-xs text-muted-foreground"><span dir="ltr">{bookingCode(b.number)}</span> · {b.service_date === today ? "اليوم" : formatDate(b.service_date)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{bookingStatusLabels[b.status]}</span>
                </Link>
              </li>
            ))}
            {ops.today.length + ops.upcoming.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">لا توجد حجوزات قادمة</li>}
          </ul>
        </section>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link key={s.label} to={s.to as any} className="group rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
            <s.icon className="size-5 text-primary" />
            <p className="mt-3 font-display text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="rounded-xl border bg-card lg:col-span-3">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">أحدث الطلبات</h2>
            <Link to={p.requests} className="flex items-center gap-1 text-sm text-primary">الكل <ArrowLeft className="size-4" /></Link>
          </div>
          <ul className="divide-y">
            {rs.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{names.get(r.customer_id) ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span dir="ltr">{requestCode(r.number)}</span> · {svcNames.get(r.service_id ?? "") ?? "خدمة"} · {formatDate(r.service_date)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
            {rs.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">لا توجد طلبات بعد</li>}
          </ul>
        </section>
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">الطلبات حسب الحالة</h2>
          <div className="space-y-3">
            {statusOrder.map((s) => {
              const n = rs.filter((r) => r.status === s).length;
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-xs"><span>{statusLabels[s]}</span><span className="font-semibold">{n}</span></div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={cn("h-2 rounded-full", statusBar[s])} style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <RequestDialog open={reqOpen} onOpenChange={setReqOpen} />
      <BookingDialog open={bookOpen} onOpenChange={setBookOpen} />
      <CustomerDialog open={custOpen} onOpenChange={setCustOpen} />
    </>
  );
}
