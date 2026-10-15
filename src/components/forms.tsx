import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/kit";
import {
  customerSourceLabels, priorityLabels, requestSourceLabels, statusLabels, statusOrder,
  type Customer, type Partner, type TravelRequest,
} from "@/lib/domain";
import { useCustomers, useMembers, usePartners, useSaveCustomer, useSavePartner, useSaveRequest, useServices } from "@/lib/data/context";

type DialogProps<T> = { open: boolean; onOpenChange: (o: boolean) => void; initial?: Partial<T> | null };

export function FormDialog({ open, onOpenChange, title, children, onSubmit, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; onSubmit: () => void; pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="text-start font-display">{title}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {children}
          <DialogFooter className="col-span-full mt-2 gap-2 sm:justify-start">
            <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const blankCustomer = { full_name: "", phone: "", email: "", passport_number: "", nationality: "", notes: "", source: "direct" as Customer["source"], referring_partner_id: "", assigned_to: "" };

export function CustomerDialog({ open, onOpenChange, initial }: DialogProps<Customer>) {
  const [f, setF] = useState(blankCustomer);
  const partners = usePartners().data ?? [];
  const members = useMembers().data ?? [];
  const save = useSaveCustomer();
  useEffect(() => {
    if (open) setF({ ...blankCustomer, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])) } as typeof blankCustomer);
  }, [open, initial]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <FormDialog
      open={open} onOpenChange={onOpenChange} title={initial?.id ? "تعديل العميل" : "إضافة عميل"} pending={save.isPending}
      onSubmit={() => {
        if (!f.full_name.trim()) return;
        save.mutate(
          {
            id: initial?.id, full_name: f.full_name.trim(), phone: f.phone || null, email: f.email || null,
            passport_number: f.passport_number || null, nationality: f.nationality || null, notes: f.notes || null,
            source: f.source, referring_partner_id: f.source === "partner" ? f.referring_partner_id || null : null,
            assigned_to: f.assigned_to || null,
          },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <Field label="الاسم الكامل *" className="sm:col-span-2"><Input required value={f.full_name} onChange={set("full_name")} /></Field>
      <Field label="رقم الهاتف"><Input dir="ltr" className="text-end" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" className="text-end" value={f.email} onChange={set("email")} /></Field>
      <Field label="رقم الجواز"><Input dir="ltr" className="text-end" value={f.passport_number} onChange={set("passport_number")} /></Field>
      <Field label="الجنسية"><Input value={f.nationality} onChange={set("nationality")} /></Field>
      <Field label="مصدر العميل">
        <NativeSelect value={f.source} onChange={set("source")}>
          {Object.entries(customerSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      {f.source === "partner" ? (
        <Field label="المكتب المُحيل">
          <NativeSelect value={f.referring_partner_id} onChange={set("referring_partner_id")}>
            <option value="">— اختر —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      ) : <div className="hidden sm:block" />}
      <Field label="الموظف المسؤول">
        <NativeSelect value={f.assigned_to} onChange={set("assigned_to")}>
          <option value="">— غير محدد —</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </Field>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

const blankRequest = {
  customer_id: "", service_id: "", details: "", source: "direct" as TravelRequest["source"], referring_partner_id: "",
  assigned_to: "", service_date: "", priority: "normal" as TravelRequest["priority"], status: "new" as TravelRequest["status"], notes: "",
};

export function RequestDialog({ open, onOpenChange, initial }: DialogProps<TravelRequest>) {
  const [f, setF] = useState(blankRequest);
  const customers = useCustomers().data ?? [];
  const partners = usePartners().data ?? [];
  const members = useMembers().data ?? [];
  const services = (useServices().data ?? []).filter((s) => s.is_active || s.id === initial?.service_id);
  const save = useSaveRequest();
  useEffect(() => {
    if (open) setF({ ...blankRequest, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])) } as typeof blankRequest);
  }, [open, initial]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <FormDialog
      open={open} onOpenChange={onOpenChange} title={initial?.id ? "تعديل الطلب" : "طلب جديد"} pending={save.isPending}
      onSubmit={() => {
        if (!f.customer_id) return;
        save.mutate(
          {
            id: initial?.id, customer_id: f.customer_id, service_id: f.service_id || null, details: f.details || null,
            source: f.source, referring_partner_id: f.source === "partner" ? f.referring_partner_id || null : null,
            assigned_to: f.assigned_to || null, service_date: f.service_date || null, priority: f.priority, status: f.status, notes: f.notes || null,
          },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <Field label="العميل *">
        <NativeSelect required value={f.customer_id} onChange={set("customer_id")}>
          <option value="">— اختر العميل —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="نوع الخدمة">
        <NativeSelect value={f.service_id} onChange={set("service_id")}>
          <option value="">— اختر —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="تفاصيل الطلب" className="sm:col-span-2"><Textarea rows={2} value={f.details} onChange={set("details")} /></Field>
      <Field label="مصدر الطلب">
        <NativeSelect value={f.source} onChange={set("source")}>
          {Object.entries(requestSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      {f.source === "partner" ? (
        <Field label="المكتب المُحيل">
          <NativeSelect value={f.referring_partner_id} onChange={set("referring_partner_id")}>
            <option value="">— اختر —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      ) : <div className="hidden sm:block" />}
      <Field label="تاريخ الخدمة"><Input type="date" value={f.service_date} onChange={set("service_date")} /></Field>
      <Field label="الأولوية">
        <NativeSelect value={f.priority} onChange={set("priority")}>
          {Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الحالة">
        <NativeSelect value={f.status} onChange={set("status")}>
          {statusOrder.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الموظف المسؤول">
        <NativeSelect value={f.assigned_to} onChange={set("assigned_to")}>
          <option value="">— غير محدد —</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </Field>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

const blankPartner = { name: "", phone: "", email: "", country: "", city: "", contact_person: "", notes: "", status: "active" as Partner["status"] };

export function PartnerDialog({ open, onOpenChange, initial }: DialogProps<Partner>) {
  const [f, setF] = useState(blankPartner);
  const save = useSavePartner();
  useEffect(() => {
    if (open) setF({ ...blankPartner, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])) } as typeof blankPartner);
  }, [open, initial]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <FormDialog
      open={open} onOpenChange={onOpenChange} title={initial?.id ? "تعديل مكتب شريك" : "إضافة مكتب شريك"} pending={save.isPending}
      onSubmit={() => {
        if (!f.name.trim()) return;
        save.mutate(
          { id: initial?.id, name: f.name.trim(), phone: f.phone || null, email: f.email || null, country: f.country || null, city: f.city || null, contact_person: f.contact_person || null, notes: f.notes || null, status: f.status },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <Field label="اسم المكتب *" className="sm:col-span-2"><Input required value={f.name} onChange={set("name")} /></Field>
      <Field label="رقم الهاتف"><Input dir="ltr" className="text-end" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" className="text-end" value={f.email} onChange={set("email")} /></Field>
      <Field label="الدولة"><Input value={f.country} onChange={set("country")} /></Field>
      <Field label="المدينة"><Input value={f.city} onChange={set("city")} /></Field>
      <Field label="الشخص المسؤول"><Input value={f.contact_person} onChange={set("contact_person")} /></Field>
      <Field label="الحالة">
        <NativeSelect value={f.status} onChange={set("status")}>
          <option value="active">نشط</option>
          <option value="inactive">غير نشط</option>
        </NativeSelect>
      </Field>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}
