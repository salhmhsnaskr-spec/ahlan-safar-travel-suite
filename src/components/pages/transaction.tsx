import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, ListTodo, Save, Search, UserPlus, X } from "lucide-react";
import {
  useBookings, useCustomers, useData, useDocuments, useMembers, usePaths, useRequests, useSaveCustomer, useSaveRequest, useServices, useTasks,
} from "@/lib/data/context";
import { EmptyState, Field, NativeSelect, PageHeader, ReadState, StatusBadge } from "@/components/kit";
import { BookingDialog, TaskDialog } from "@/components/forms-ops";
import { BookingTable } from "@/components/pages/bookings";
import { TaskList } from "@/components/pages/tasks";
import { DocumentsPanel } from "@/components/pages/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, priorityLabels, requestCode, statusLabels, statusOrder, type Customer, type TravelRequest } from "@/lib/domain";
import { cleanDetails, deriveServiceDate, fieldsFor, findDuplicateCustomer, searchCustomers, type ServiceDetails } from "@/lib/transaction";
import { cn } from "@/lib/utils";

type Common = { service_id: string; assigned_to: string; service_date: string; priority: TravelRequest["priority"]; status: TravelRequest["status"]; details: string; notes: string };
const blankCommon: Common = { service_id: "", assigned_to: "", service_date: "", priority: "normal", status: "new", details: "", notes: "" };

/** Service picker + specialised fields + common fields; shared by the new and detail screens. */
function TransactionFields({ c, setC, d, setD }: { c: Common; setC: (f: (s: Common) => Common) => void; d: ServiceDetails; setD: (f: (s: ServiceDetails) => ServiceDetails) => void }) {
  const services = (useServices().data ?? []).filter((s) => s.is_active || s.id === c.service_id);
  const members = useMembers().data ?? [];
  const service = services.find((s) => s.id === c.service_id);
  const fields = fieldsFor(service);
  const set = (k: keyof Common) => (e: { target: { value: string } }) => setC((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">نوع الخدمة</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => setC((x) => ({ ...x, service_id: s.id }))}
              className={cn("rounded-lg border px-3 py-2 text-sm text-start", c.service_id === s.id ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background hover:border-primary/50")}>
              {s.name}
            </button>
          ))}
        </div>
        {fields.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "select" ? (
                  <NativeSelect aria-label={f.label} value={d[f.key] ?? ""} onChange={(e) => setD((s) => ({ ...s, [f.key]: e.target.value }))}>
                    <option value="">— اختر —</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </NativeSelect>
                ) : (
                  <Input aria-label={f.label} type={f.type} min={f.type === "number" ? 0 : undefined} dir={f.ltr ? "ltr" : undefined} className={f.ltr ? "text-end" : undefined}
                    value={d[f.key] ?? ""} onChange={(e) => setD((s) => ({ ...s, [f.key]: e.target.value }))} />
                )}
              </Field>
            ))}
          </div>
        )}
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <Field label="الموظف المسؤول">
          <NativeSelect aria-label="الموظف المسؤول" value={c.assigned_to} onChange={set("assigned_to")}>
            <option value="">— غير محدد —</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
          </NativeSelect>
        </Field>
        <Field label="موعد الخدمة"><Input aria-label="موعد الخدمة" type="date" value={c.service_date} onChange={set("service_date")} /></Field>
        <Field label="الحالة">
          <NativeSelect aria-label="حالة المعاملة" value={c.status} onChange={set("status")}>
            {statusOrder.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="الأولوية">
          <NativeSelect aria-label="الأولوية" value={c.priority} onChange={set("priority")}>
            {Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="تفاصيل الطلب" className="sm:col-span-2"><Textarea aria-label="تفاصيل الطلب" rows={2} value={c.details} onChange={set("details")} /></Field>
        <Field label="ملاحظات المتابعة" className="sm:col-span-2"><Textarea aria-label="ملاحظات المتابعة" rows={2} value={c.notes} onChange={set("notes")} /></Field>
      </section>
    </>
  );
}

function usePayload() {
  const services = useServices().data ?? [];
  return (c: Common, d: ServiceDetails) => {
    const fields = fieldsFor(services.find((s) => s.id === c.service_id));
    const details = cleanDetails(fields, d);
    return {
      service_id: c.service_id || null, assigned_to: c.assigned_to || null, priority: c.priority, status: c.status,
      service_date: c.service_date || deriveServiceDate(fields, details), details: c.details.trim() || null, notes: c.notes.trim() || null,
      service_details: details,
    };
  };
}

export function NewTransactionPage() {
  const p = usePaths();
  const api = useData();
  const navigate = useNavigate();
  const customers = useCustomers().data ?? [];
  const saveCustomer = useSaveCustomer();
  const saveRequest = useSaveRequest();
  const payload = usePayload();
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ full_name: "", phone: "", email: "", passport_number: "", nationality: "" });
  const [c, setC] = useState<Common>({ ...blankCommon, assigned_to: api.userId });
  const [d, setD] = useState<ServiceDetails>({});
  const [error, setError] = useState("");
  const dup = creating ? findDuplicateCustomer(customers, nc) : undefined;
  const results = searchCustomers(customers, q);
  const pending = saveCustomer.isPending || saveRequest.isPending;

  async function submit() {
    setError("");
    try {
      let cust = customer;
      if (!cust) {
        if (!creating || !nc.full_name.trim()) return setError("اختر عميلًا موجودًا أو أدخل اسم العميل الجديد.");
        if (dup) return setError(`يوجد عميل مسجّل بنفس البيانات: ${dup.full_name}. استخدمه بدل إنشاء عميل مكرر.`);
        cust = await saveCustomer.mutateAsync({
          full_name: nc.full_name.trim(), phone: nc.phone.trim() || null, email: nc.email.trim() || null,
          passport_number: nc.passport_number.trim() || null, nationality: nc.nationality.trim() || null, assigned_to: c.assigned_to || null,
        });
        setCustomer(cust); setCreating(false);
      }
      const r = await saveRequest.mutateAsync({ customer_id: cust.id, ...payload(c, d) });
      navigate({ to: p.transaction, params: { id: r.id } });
    } catch { /* toast already shown */ }
  }

  return (
    <>
      <PageHeader title="معاملة جديدة" subtitle="سجّل العميل والخدمة الآن، ويمكنك استكمال التفاصيل لاحقًا" />
      <div className="mx-auto grid max-w-3xl gap-4">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">العميل</h2>
          {customer ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
              <div className="min-w-0"><p className="truncate font-semibold">{customer.full_name}</p><p className="truncate text-xs text-muted-foreground" dir="ltr">{customer.phone ?? customer.email ?? ""}</p></div>
              <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}><X /> تغيير</Button>
            </div>
          ) : creating ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم العميل *"><Input aria-label="اسم العميل الجديد" value={nc.full_name} onChange={(e) => setNc({ ...nc, full_name: e.target.value })} /></Field>
              <Field label="الجوال"><Input aria-label="جوال العميل" dir="ltr" className="text-end" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
              <Field label="البريد الإلكتروني"><Input aria-label="بريد العميل" dir="ltr" className="text-end" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></Field>
              <Field label="رقم الجواز"><Input aria-label="رقم الجواز" dir="ltr" className="text-end" value={nc.passport_number} onChange={(e) => setNc({ ...nc, passport_number: e.target.value })} /></Field>
              <Field label="الجنسية"><Input aria-label="الجنسية" value={nc.nationality} onChange={(e) => setNc({ ...nc, nationality: e.target.value })} /></Field>
              {dup && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:col-span-2">
                  <span>العميل مسجّل مسبقًا: <b>{dup.full_name}</b></span>
                  <Button size="sm" onClick={() => { setCustomer(dup); setCreating(false); }}>استخدام العميل الموجود</Button>
                </div>
              )}
              <Button variant="ghost" className="justify-self-start" onClick={() => setCreating(false)}>رجوع للبحث</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-9" aria-label="بحث عن عميل" placeholder="ابحث بالاسم أو الجوال أو البريد أو الجواز" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {results.length > 0 && (
                <ul className="mt-2 divide-y rounded-lg border">
                  {results.map((r) => (
                    <li key={r.id}><button type="button" onClick={() => setCustomer(r)} className="flex w-full justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
                      <span className="truncate font-medium">{r.full_name}</span><span className="shrink-0 text-xs text-muted-foreground" dir="ltr">{r.phone ?? ""}</span>
                    </button></li>
                  ))}
                </ul>
              )}
              {q.trim() && results.length === 0 && <p className="mt-2 text-sm text-muted-foreground">لا يوجد عميل مطابق.</p>}
              <Button variant="outline" className="mt-3" onClick={() => { setCreating(true); setNc((s) => ({ ...s, full_name: /\d/.test(q) ? s.full_name : q.trim(), phone: /\d/.test(q) ? q.trim() : s.phone })); }}>
                <UserPlus /> عميل جديد
              </Button>
            </>
          )}
        </section>
        <TransactionFields c={c} setC={setC} d={d} setD={setD} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end"><Button onClick={submit} disabled={pending}><Save /> {pending ? "جارٍ الحفظ…" : "حفظ المعاملة"}</Button></div>
      </div>
    </>
  );
}

export function TransactionDetailPage({ id }: { id: string }) {
  const requests = useRequests();
  const customers = useCustomers();
  const bookings = useBookings();
  const tasks = useTasks();
  const services = useServices();
  const members = useMembers();
  const documents = useDocuments();
  return (
    <ReadState queries={[requests, customers, bookings, tasks, services, members, documents]} title="تعذّر تحميل تفاصيل المعاملة">
      <TransactionDetailContent id={id} />
    </ReadState>
  );
}

function TransactionDetailContent({ id }: { id: string }) {
  const p = usePaths();
  const api = useData();
  const requests = useRequests();
  const customers = useCustomers().data ?? [];
  const bookings = (useBookings().data ?? []).filter((b) => b.request_id === id);
  const tasks = (useTasks().data ?? []).filter((t) => t.request_id === id);
  const save = useSaveRequest();
  const payload = usePayload();
  const r = requests.data?.find((x) => x.id === id);
  const [c, setC] = useState<Common>(blankCommon);
  const [d, setD] = useState<ServiceDetails>({});
  const [book, setBook] = useState(false);
  const [task, setTask] = useState(false);
  useEffect(() => {
    if (!r) return;
    setC({ service_id: r.service_id ?? "", assigned_to: r.assigned_to ?? "", service_date: r.service_date ?? "", priority: r.priority, status: r.status, details: r.details ?? "", notes: r.notes ?? "" });
    setD((r.service_details as ServiceDetails | null) ?? {});
  }, [r?.id, r?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return <EmptyState title="المعاملة غير موجودة" action={<Link to={p.requests} className="text-primary">العودة إلى الطلبات</Link>} />;
  const cust = customers.find((x) => x.id === r.customer_id);
  const code = requestCode(r.number);

  return (
    <>
      <Link to={p.requests} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> الطلبات</Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold"><span dir="ltr">{code}</span><StatusBadge status={r.status} /></h1>
          <p className="text-sm text-muted-foreground">
            العميل: {cust ? <Link to={p.customer} params={{ id: cust.id }} className="text-primary">{cust.full_name}</Link> : "—"} · أُنشئت {formatDate(r.created_at)} · آخر تحديث {formatDate(r.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status !== "cancelled" && <Button variant="outline" onClick={() => setBook(true)}><CalendarCheck /> إنشاء حجز</Button>}
          {api.role === "admin" && <Button variant="outline" onClick={() => setTask(true)}><ListTodo /> مهمة متابعة</Button>}
        </div>
      </div>
      <div className="grid gap-4">
        <TransactionFields c={c} setC={setC} d={d} setD={setD} />
        <div className="flex justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate({ id: r.id, customer_id: r.customer_id, ...payload(c, d) })}><Save /> حفظ التغييرات</Button>
        </div>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">الحجوزات المرتبطة</h2>
      <BookingTable list={bookings} emptyTitle="لا توجد حجوزات لهذه المعاملة" />
      <h2 className="mb-3 mt-8 font-semibold">المهام والمتابعات</h2>
      <TaskList list={tasks} emptyTitle="لا توجد مهام لهذه المعاملة" />
      <h2 className="mb-3 mt-8 font-semibold">مستندات المعاملة</h2>
      <DocumentsPanel links={{ request_id: r.id, customer_id: r.customer_id }} filter={(x) => x.request_id === r.id} />
      <BookingDialog open={book} onOpenChange={setBook} initial={book ? { customer_id: r.customer_id, request_id: r.id, service_id: r.service_id, service_date: r.service_date, assigned_employee_id: r.assigned_to } : null} />
      <TaskDialog open={task} onOpenChange={setTask} initial={task ? { request_id: r.id, customer_id: r.customer_id, service_id: r.service_id, task_type: "customer_followup", title: `متابعة المعاملة ${code}`, assigned_to: r.assigned_to } : null} />
    </>
  );
}
