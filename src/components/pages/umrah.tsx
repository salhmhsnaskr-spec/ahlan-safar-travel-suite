import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import {
  useCustomers, useData, useDeleteParticipant, useDeleteTrip, useParticipants, usePaths, useRequests, useSaveParticipant, useSaveTrip, useServices, useTrips,
} from "@/lib/data/context";
import { EmptyState, Field, NativeSelect, PageHeader, ReadState } from "@/components/kit";
import { FormDialog } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, requestCode, type UmrahParticipant, type UmrahTrip } from "@/lib/domain";
import { pilgrimStatusLabels, stayDuration, stayLabel, tripStatusLabels, validateParticipantDates } from "@/lib/umrah";

const today = () => new Date().toISOString().slice(0, 10);

export function UmrahPage() {
  const trips = useTrips();
  const participants = useParticipants();
  const customers = useCustomers();
  const requests = useRequests();
  const services = useServices();
  return (
    <ReadState queries={[trips, participants, customers, requests, services]} title="تعذّر تحميل رحلات العمرة">
      <UmrahContent />
    </ReadState>
  );
}

function UmrahContent() {
  const trips = useTrips().data ?? [];
  const participants = useParticipants().data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [editTrip, setEditTrip] = useState<Partial<UmrahTrip> | null>(null);
  const trip = trips.find((t) => t.id === selected) ?? null;
  return (
    <>
      <PageHeader
        title="رحلات العمرة"
        subtitle="المعتمر هو عميل المكتب؛ طلب العمرة الفردي يُنشأ من «معاملة جديدة» بخدمة «عمرة»، والرحلات الجماعية تُدار هنا."
        actions={<Button onClick={() => setEditTrip({})}><Plus /> رحلة جماعية جديدة</Button>}
      />
      {trips.length === 0 ? (
        <EmptyState title="لا توجد رحلات عمرة بعد" body="أنشئ رحلة جماعية ثم أضف إليها المعتمرين من عملاء المكتب." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => {
            const n = participants.filter((p) => p.trip_id === t.id).length;
            return (
              <button key={t.id} type="button" onClick={() => setSelected(t.id)}
                className={"rounded-xl border bg-card p-4 text-start transition-colors hover:border-primary " + (t.id === selected ? "border-primary ring-1 ring-primary" : "")}>
                <p className="truncate font-semibold">{t.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tripStatusLabels[t.status]} · {t.planned_start ? formatDate(t.planned_start) : "بدون تاريخ"}{t.planned_end ? " ← " + formatDate(t.planned_end) : ""}</p>
                <p className="mt-2 flex items-center gap-1 text-sm"><Users className="size-4" /> {n} معتمر</p>
              </button>
            );
          })}
        </div>
      )}
      {trip && <TripDetail trip={trip} onEdit={() => setEditTrip(trip)} onDeleted={() => setSelected(null)} />}
      <TripDialog initial={editTrip} onClose={() => setEditTrip(null)} onSaved={(id) => setSelected(id)} />
    </>
  );
}

function TripDialog({ initial, onClose, onSaved }: { initial: Partial<UmrahTrip> | null; onClose: () => void; onSaved: (id: string) => void }) {
  const save = useSaveTrip();
  const [f, setF] = useState({ name: "", planned_start: "", planned_end: "", status: "planned" as UmrahTrip["status"], notes: "" });
  const [err, setErr] = useState("");
  useEffect(() => {
    if (initial) { setErr(""); setF({ name: initial.name ?? "", planned_start: initial.planned_start ?? "", planned_end: initial.planned_end ?? "", status: initial.status ?? "planned", notes: initial.notes ?? "" }); }
  }, [initial]);
  return (
    <FormDialog open={!!initial} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "تعديل الرحلة" : "رحلة عمرة جماعية جديدة"} pending={save.isPending}
      onSubmit={() => {
        if (!f.name.trim()) return setErr("أدخل اسم الرحلة أو رقمها.");
        if (f.planned_start && f.planned_end && f.planned_end < f.planned_start) return setErr("تاريخ النهاية المخطط قبل تاريخ البداية.");
        save.mutate({ id: initial?.id, name: f.name.trim(), planned_start: f.planned_start || null, planned_end: f.planned_end || null, status: f.status, notes: f.notes.trim() || null },
          { onSuccess: (t) => { onSaved(t.id); onClose(); } });
      }}>
      <Field label="اسم الرحلة أو رقمها *" className="sm:col-span-2"><Input aria-label="اسم الرحلة" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="البداية المخططة"><Input aria-label="البداية المخططة" type="date" value={f.planned_start} onChange={(e) => setF({ ...f, planned_start: e.target.value })} /></Field>
      <Field label="النهاية المخططة"><Input aria-label="النهاية المخططة" type="date" value={f.planned_end} onChange={(e) => setF({ ...f, planned_end: e.target.value })} /></Field>
      <Field label="حالة الرحلة">
        <NativeSelect aria-label="حالة الرحلة" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as UmrahTrip["status"] })}>
          {Object.entries(tripStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea aria-label="ملاحظات الرحلة" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
    </FormDialog>
  );
}

function TripDetail({ trip, onEdit, onDeleted }: { trip: UmrahTrip; onEdit: () => void; onDeleted: () => void }) {
  const api = useData();
  const p = usePaths();
  const list = (useParticipants().data ?? []).filter((x) => x.trip_id === trip.id);
  const customers = useCustomers().data ?? [];
  const del = useDeleteTrip();
  const remove = useDeleteParticipant();
  const [edit, setEdit] = useState<Partial<UmrahParticipant> | null>(null);
  const name = (id: string) => customers.find((c) => c.id === id)?.full_name ?? "—";
  return (
    <section className="mt-6 rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{trip.name}</h2>
          <p className="text-xs text-muted-foreground">حالة الرحلة: {tripStatusLabels[trip.status]} · {list.length} معتمر</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil /> تعديل الرحلة</Button>
          <Button size="sm" onClick={() => setEdit({ trip_id: trip.id })}><UserPlus /> إضافة معتمر</Button>
          {api.role === "admin" && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => { if (confirm("حذف الرحلة وجميع سجلات مشاركة المعتمرين فيها؟ لن يُحذف العملاء.")) del.mutate(trip.id, { onSuccess: onDeleted }); }}><Trash2 /> حذف</Button>
          )}
        </div>
      </div>
      {list.length === 0 ? <EmptyState title="لا يوجد معتمرون في هذه الرحلة" body="أضف المعتمرين من عملاء المكتب." /> : (
        <ul className="divide-y rounded-lg border">
          {list.map((x) => {
            const stay = stayDuration(x.actual_entry, x.actual_exit, today());
            return (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link to={p.customer} params={{ id: x.customer_id }} className="font-medium text-primary">{name(x.customer_id)}</Link>
                  <p className="text-xs text-muted-foreground">
                    {pilgrimStatusLabels[x.status]} · الدخول الفعلي: {x.actual_entry ? formatDate(x.actual_entry) : "—"} · المغادرة الفعلية: {x.actual_exit ? formatDate(x.actual_exit) : "—"} · <b>{stayLabel(stay)}</b>
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label="تعديل المعتمر" onClick={() => setEdit(x)}><Pencil /></Button>
                  <Button size="sm" variant="ghost" aria-label="إزالة من الرحلة" className="text-danger" onClick={() => { if (confirm("إزالة المعتمر من هذه الرحلة؟ لن يُحذف سجل العميل.")) remove.mutate(x.id); }}><Trash2 /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">مدة الإقامة تشمل يوم الدخول ويوم المغادرة. قبل المغادرة تُعرض «الأيام حتى الآن».</p>
      <ParticipantDialog initial={edit} onClose={() => setEdit(null)} />
    </section>
  );
}

const blankP = { customer_id: "", request_id: "", status: "registered" as UmrahParticipant["status"], planned_entry: "", planned_exit: "", actual_entry: "", actual_exit: "", notes: "" };

function ParticipantDialog({ initial, onClose }: { initial: Partial<UmrahParticipant> | null; onClose: () => void }) {
  const customers = useCustomers().data ?? [];
  const requests = useRequests().data ?? [];
  const services = useServices().data ?? [];
  const all = useParticipants().data ?? [];
  const save = useSaveParticipant();
  const [f, setF] = useState(blankP);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!initial) return;
    setErr("");
    setF({ ...blankP, ...Object.fromEntries(Object.entries(initial).filter(([k, v]) => k in blankP && v != null)) } as typeof blankP);
  }, [initial]);
  const taken = new Set(all.filter((x) => x.trip_id === initial?.trip_id && x.id !== initial?.id).map((x) => x.customer_id));
  const umrahIds = new Set(services.filter((s) => s.code === "umrah").map((s) => s.id));
  const custRequests = requests.filter((r) => r.customer_id === f.customer_id && r.service_id && umrahIds.has(r.service_id));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <FormDialog open={!!initial} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "تعديل بيانات المعتمر في الرحلة" : "إضافة معتمر إلى الرحلة"} pending={save.isPending}
      onSubmit={() => {
        if (!f.customer_id) return setErr("اختر المعتمر.");
        if (taken.has(f.customer_id)) return setErr("هذا المعتمر مضاف مسبقًا إلى هذه الرحلة.");
        const dates = { planned_entry: f.planned_entry || null, planned_exit: f.planned_exit || null, actual_entry: f.actual_entry || null, actual_exit: f.actual_exit || null };
        const v = validateParticipantDates(dates);
        if (v) return setErr(v);
        save.mutate({ id: initial?.id, trip_id: initial!.trip_id!, customer_id: f.customer_id, request_id: f.request_id || null, status: f.status, notes: f.notes.trim() || null, ...dates },
          { onSuccess: onClose });
      }}>
      <Field label="المعتمر (من عملاء المكتب) *" className="sm:col-span-2">
        <NativeSelect aria-label="المعتمر" value={f.customer_id} disabled={!!initial?.id} onChange={(e) => setF((s) => ({ ...s, customer_id: e.target.value, request_id: "" }))}>
          <option value="">— اختر —</option>
          {customers.filter((c) => !taken.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="طلب العمرة المرتبط (اختياري)" className="sm:col-span-2">
        <NativeSelect aria-label="طلب العمرة المرتبط" value={f.request_id} onChange={set("request_id")}>
          <option value="">— بدون ربط —</option>
          {custRequests.map((r) => <option key={r.id} value={r.id}>{requestCode(r.number)} · {formatDate(r.created_at)}</option>)}
        </NativeSelect>
      </Field>
      <Field label="حالة المعتمر في الرحلة" className="sm:col-span-2">
        <NativeSelect aria-label="حالة المعتمر" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as UmrahParticipant["status"] })}>
          {Object.entries(pilgrimStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الدخول المخطط"><Input aria-label="الدخول المخطط" type="date" value={f.planned_entry} onChange={set("planned_entry")} /></Field>
      <Field label="المغادرة المخططة"><Input aria-label="المغادرة المخططة" type="date" value={f.planned_exit} onChange={set("planned_exit")} /></Field>
      <Field label="الدخول الفعلي إلى السعودية"><Input aria-label="الدخول الفعلي" type="date" value={f.actual_entry} onChange={set("actual_entry")} /></Field>
      <Field label="المغادرة الفعلية"><Input aria-label="المغادرة الفعلية" type="date" value={f.actual_exit} onChange={set("actual_exit")} /></Field>
      <p className="text-sm sm:col-span-2">مدة الإقامة: <b>{stayLabel(stayDuration(f.actual_entry || null, f.actual_exit || null, today()))}</b></p>
      <Field label="ملاحظات" className="sm:col-span-2"><Textarea aria-label="ملاحظات المعتمر" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
    </FormDialog>
  );
}
