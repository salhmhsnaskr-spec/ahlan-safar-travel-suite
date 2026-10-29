import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/kit";
import { FormDialog } from "@/components/forms";
import {
  bookingCode, bookingStatusLabels, bookingStatusOrder, requestCode, taskPriorityLabels, taskStatusLabels, taskStatusOrder, taskTypeLabels,
  type Booking, type Task,
} from "@/lib/domain";
import { useBookings, useCustomers, useData, useMembers, useRequests, useSaveBooking, useSaveTask, useServices } from "@/lib/data/context";

type DialogProps<T> = { open: boolean; onOpenChange: (o: boolean) => void; initial?: Partial<T> | null };
const fill = <T extends object>(blank: T, initial: object | null | undefined) =>
  ({ ...blank, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])) }) as T;
/** ISO timestamp -> value for <input type="datetime-local"> in local time */
const toLocalInput = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const blankBooking = {
  customer_id: "", request_id: "", service_id: "", assigned_employee_id: "", service_date: "", status: "new" as Booking["status"],
  external_ref: "", provider: "", notes: "",
};

export function BookingDialog({ open, onOpenChange, initial }: DialogProps<Booking>) {
  const [f, setF] = useState(blankBooking);
  const customers = useCustomers().data ?? [];
  const requests = useRequests().data ?? [];
  const members = useMembers().data ?? [];
  const services = (useServices().data ?? []).filter((s) => s.is_active || s.id === initial?.service_id);
  const save = useSaveBooking();
  useEffect(() => { if (open) setF(fill(blankBooking, initial)); }, [open, initial]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const customerRequests = requests.filter((r) => r.customer_id === f.customer_id);

  return (
    <FormDialog
      open={open} onOpenChange={onOpenChange} title={initial?.id ? "تعديل الحجز" : "حجز جديد"} pending={save.isPending}
      onSubmit={() => {
        if (!f.customer_id || !f.service_id) return;
        save.mutate(
          {
            id: initial?.id, customer_id: f.customer_id, request_id: f.request_id || null, service_id: f.service_id,
            assigned_employee_id: f.assigned_employee_id || null, service_date: f.service_date || null, status: f.status,
            external_ref: f.external_ref || null, provider: f.provider || null, notes: f.notes || null,
          },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <Field label="العميل *">
        <NativeSelect required aria-label="العميل" value={f.customer_id} onChange={(e) => setF((s) => ({ ...s, customer_id: e.target.value, request_id: "" }))}>
          <option value="">— اختر العميل —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الخدمة *">
        <NativeSelect required aria-label="الخدمة" value={f.service_id} onChange={set("service_id")}>
          <option value="">— اختر الخدمة —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الطلب المرتبط">
        <NativeSelect aria-label="الطلب المرتبط" value={f.request_id} onChange={(e) => {
          const r = requests.find((x) => x.id === e.target.value);
          setF((s) => ({ ...s, request_id: e.target.value, service_id: s.service_id || r?.service_id || "", service_date: s.service_date || r?.service_date || "" }));
        }} disabled={!f.customer_id}>
          <option value="">— بدون طلب —</option>
          {customerRequests.map((r) => <option key={r.id} value={r.id}>{requestCode(r.number)} {r.details ? "— " + r.details.slice(0, 30) : ""}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الموظف المسؤول">
        <NativeSelect aria-label="الموظف المسؤول" value={f.assigned_employee_id} onChange={set("assigned_employee_id")}>
          <option value="">— غير محدد —</option>
          {members.filter((m) => (m.status ?? "active") === "active").map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </Field>
      <Field label="موعد الخدمة"><Input aria-label="موعد الخدمة" type="date" value={f.service_date} onChange={set("service_date")} /></Field>
      <Field label="الحالة">
        <NativeSelect aria-label="حالة الحجز" value={f.status} onChange={set("status")}>
          {bookingStatusOrder.map((s) => <option key={s} value={s}>{bookingStatusLabels[s]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="المرجع الخارجي"><Input aria-label="المرجع الخارجي" dir="ltr" className="text-end" value={f.external_ref} onChange={set("external_ref")} /></Field>
      <Field label="مزود الخدمة / الجهة المنفذة"><Input aria-label="مزود الخدمة" value={f.provider} onChange={set("provider")} /></Field>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea aria-label="ملاحظات" rows={2} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

const blankTask = {
  title: "", task_type: "other" as Task["task_type"], assigned_to: "", customer_id: "", request_id: "", booking_id: "", service_id: "",
  due_at: "", priority: "medium" as Task["priority"], status: "new" as Task["status"], notes: "", flight_number: "", airport: "", arrival_at: "",
};

export function TaskDialog({ open, onOpenChange, initial }: DialogProps<Task>) {
  const api = useData();
  const isAdmin = api.role === "admin";
  const [f, setF] = useState(blankTask);
  const customers = useCustomers().data ?? [];
  const requests = useRequests().data ?? [];
  const bookings = useBookings().data ?? [];
  const members = useMembers().data ?? [];
  const services = useServices().data ?? [];
  const save = useSaveTask();
  useEffect(() => {
    if (open) {
      const v = fill(blankTask, initial);
      setF({ ...v, due_at: toLocalInput(v.due_at), arrival_at: toLocalInput(v.arrival_at) });
    }
  }, [open, initial]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const names = new Map(customers.map((c) => [c.id, c.full_name]));
  const lock = !isAdmin; // employees may only change status and notes

  return (
    <FormDialog
      open={open} onOpenChange={onOpenChange} title={initial?.id ? "تعديل المهمة" : "مهمة جديدة"} pending={save.isPending}
      onSubmit={() => {
        if (!f.title.trim()) return;
        save.mutate(
          lock
            ? { id: initial?.id, status: f.status, notes: f.notes || null }
            : {
                id: initial?.id, title: f.title.trim(), task_type: f.task_type, assigned_to: f.assigned_to || null,
                customer_id: f.customer_id || null, request_id: f.request_id || null, booking_id: f.booking_id || null, service_id: f.service_id || null,
                due_at: fromLocalInput(f.due_at), priority: f.priority, status: f.status, notes: f.notes || null,
                flight_number: f.task_type === "airport_pickup" ? f.flight_number || null : null,
                airport: f.task_type === "airport_pickup" ? f.airport || null : null,
                arrival_at: f.task_type === "airport_pickup" ? fromLocalInput(f.arrival_at) : null,
              },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <Field label="عنوان المهمة *" className="sm:col-span-2"><Input aria-label="عنوان المهمة" required disabled={lock} value={f.title} onChange={set("title")} /></Field>
      <Field label="نوع المهمة">
        <NativeSelect aria-label="نوع المهمة" disabled={lock} value={f.task_type} onChange={set("task_type")}>
          {Object.entries(taskTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الموظف المسؤول">
        <NativeSelect aria-label="الموظف المسؤول" disabled={lock} value={f.assigned_to} onChange={set("assigned_to")}>
          <option value="">— غير محدد —</option>
          {members.filter((m) => (m.status ?? "active") === "active").map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </Field>
      <Field label="موعد الاستحقاق"><Input aria-label="موعد الاستحقاق" type="datetime-local" disabled={lock} value={f.due_at} onChange={set("due_at")} /></Field>
      <Field label="الأولوية">
        <NativeSelect aria-label="الأولوية" disabled={lock} value={f.priority} onChange={set("priority")}>
          {Object.entries(taskPriorityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الحالة">
        <NativeSelect aria-label="حالة المهمة" value={f.status} onChange={set("status")}>
          {taskStatusOrder.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="العميل المرتبط">
        <NativeSelect aria-label="العميل المرتبط" disabled={lock} value={f.customer_id} onChange={set("customer_id")}>
          <option value="">— لا يوجد —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الطلب المرتبط">
        <NativeSelect aria-label="الطلب المرتبط" disabled={lock} value={f.request_id} onChange={set("request_id")}>
          <option value="">— لا يوجد —</option>
          {requests.map((r) => <option key={r.id} value={r.id}>{requestCode(r.number)} — {names.get(r.customer_id) ?? ""}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الحجز المرتبط">
        <NativeSelect aria-label="الحجز المرتبط" disabled={lock} value={f.booking_id} onChange={(e) => {
          const b = bookings.find((x) => x.id === e.target.value);
          setF((s) => ({ ...s, booking_id: e.target.value, customer_id: s.customer_id || b?.customer_id || "", service_id: s.service_id || b?.service_id || "" }));
        }}>
          <option value="">— لا يوجد —</option>
          {bookings.map((b) => <option key={b.id} value={b.id}>{bookingCode(b.number)} — {names.get(b.customer_id) ?? ""}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الخدمة المرتبطة">
        <NativeSelect aria-label="الخدمة المرتبطة" disabled={lock} value={f.service_id} onChange={set("service_id")}>
          <option value="">— لا يوجد —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      {f.task_type === "airport_pickup" && (
        <>
          <Field label="رقم الرحلة"><Input aria-label="رقم الرحلة" dir="ltr" className="text-end" disabled={lock} value={f.flight_number} onChange={set("flight_number")} /></Field>
          <Field label="المطار"><Input aria-label="المطار" disabled={lock} value={f.airport} onChange={set("airport")} /></Field>
          <Field label="تاريخ ووقت الوصول"><Input aria-label="تاريخ ووقت الوصول" type="datetime-local" disabled={lock} value={f.arrival_at} onChange={set("arrival_at")} /></Field>
        </>
      )}
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea aria-label="ملاحظات المهمة" rows={3} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}
