import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell, Briefcase, Car, Clock, Hotel, Map as MapIcon, Pencil, Plane, Plus, Sparkles, Stamp, Stethoscope, Trash2, UserCheck, AlertCircle, MapPin, Phone, User,
} from "lucide-react";
import {
  useAddService, useBookings, useUpdateService, useCustomers, useData, useDeletePartner, usePaths, usePartners, useRequests, useServices, useToggleService,
} from "@/lib/data/context";
import { EmptyState, Field, Loading, PageHeader } from "@/components/kit";
import { PartnerDialog } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  customerSourceLabels, deriveNotifications, formatDate, isOpenStatus, requestSourceLabels, statusBar, statusLabels, statusOrder, type Partner,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const icons: Record<string, typeof Plane> = { plane: Plane, hotel: Hotel, stamp: Stamp, car: Car, map: MapIcon, stethoscope: Stethoscope, briefcase: Briefcase, sparkles: Sparkles };

export function ServicesPage() {
  const { data, isLoading } = useServices();
  const requests = useRequests().data ?? [];
  const toggle = useToggleService();
  const add = useAddService();
  const upd = useUpdateService();
  const bookings = useBookings().data ?? [];
  const p = usePaths();
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <>
      <PageHeader title="الخدمات" subtitle="الخدمات الأساسية متاحة لكل المكاتب، ويمكنك إضافة خدمات خاصة بمكتبك." actions={<Button onClick={() => { setEditId(null); setName(""); setDesc(""); setOpen(true); }}><Plus /> خدمة جديدة</Button>} />
      {isLoading ? <Loading /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((s) => {
            const Icon = icons[s.icon ?? ""] ?? Sparkles;
            const n = requests.filter((r) => r.service_id === s.id).length;
            return (
              <div key={s.id} className={cn("rounded-xl border bg-card p-5", !s.is_active && "opacity-60")}>
                <div className="flex items-start justify-between">
                  <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
                  {s.office_id ? (
                    <Switch checked={s.is_active} onCheckedChange={(v) => toggle.mutate({ id: s.id, active: v })} aria-label="تفعيل" />
                  ) : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">أساسية</span>}
                </div>
                <p className="mt-4 font-semibold">{s.name}</p>
                {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{n} طلب</span>
                  <Link to={p.bookings} search={{ service: s.id } as never} className="text-primary">{bookings.filter((b) => b.service_id === s.id).length} حجز</Link>
                  {s.office_id && <button className="ms-auto inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setEditId(s.id); setName(s.name); setDesc(s.description ?? ""); setOpen(true); }}><Pencil className="size-3.5" /> تعديل</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="text-start">{editId ? "تعديل الخدمة" : "خدمة جديدة"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; const done = { onSuccess: () => { setOpen(false); setName(""); setDesc(""); } }; if (editId) upd.mutate({ id: editId, name: name.trim(), description: desc || null }, done); else add.mutate({ name: name.trim(), description: desc || null }, done); }}>
            <Field label="اسم الخدمة *"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="الوصف"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
            <Button type="submit" disabled={add.isPending || upd.isPending}>{editId ? "حفظ" : "إضافة"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PartnersPage() {
  const api = useData();
  const isAdmin = api.role === "admin";
  const { data, isLoading } = usePartners();
  const requests = useRequests().data ?? [];
  const customers = useCustomers().data ?? [];
  const services = useServices().data ?? [];
  const del = useDeletePartner();
  const [editing, setEditing] = useState<Partner | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Partner | null>(null);

  return (
    <>
      <PageHeader
        title="المكاتب الشريكة"
        subtitle="مكاتب السفر التي تحوّل إليك عملاء وطلبات"
        actions={isAdmin && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> إضافة مكتب</Button>}
      />
      {isLoading ? <Loading /> : (data ?? []).length === 0 ? <EmptyState title="لا توجد مكاتب شريكة" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data ?? []).map((x) => {
            const rs = requests.filter((r) => r.referring_partner_id === x.id);
            const cs = customers.filter((c) => c.referring_partner_id === x.id);
            const svc = [...new Set(rs.map((r) => r.service_id))].map((id) => services.find((s) => s.id === id)?.name).filter(Boolean);
            const stats = [
              ["الطلبات المحوّلة", rs.length], ["العملاء المحوّلون", cs.length],
              ["حالية", rs.filter((r) => isOpenStatus(r.status)).length], ["مكتملة", rs.filter((r) => r.status === "completed").length],
              ["ملغاة", rs.filter((r) => r.status === "cancelled").length],
            ] as const;
            return (
              <div key={x.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{x.name}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", x.status === "active" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
                        {x.status === "active" ? "نشط" : "غير نشط"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="size-3" />{[x.city, x.country].filter(Boolean).join("، ") || "—"}</span>
                      <span className="flex items-center gap-1"><User className="size-3" />{x.contact_person || "—"}</span>
                      <span className="flex items-center gap-1" dir="ltr"><Phone className="size-3" />{x.phone || "—"}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => { setEditing(x); setOpen(true); }}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label="حذف" className="text-danger" onClick={() => setToDelete(x)}><Trash2 /></Button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-5 gap-1 rounded-lg bg-muted/60 p-2 text-center">
                  {stats.map(([k, v]) => (
                    <div key={k}><p className="font-display text-lg font-bold">{v}</p><p className="text-[10px] leading-tight text-muted-foreground">{k}</p></div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">الخدمات المرتبطة: <span className="text-foreground">{svc.length ? svc.join("، ") : "—"}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">تاريخ الإضافة: {formatDate(x.created_at)}</p>
                {x.notes && <p className="mt-2 text-sm text-muted-foreground">{x.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
      <PartnerDialog open={open} onOpenChange={setOpen} initial={editing} />
      <ConfirmDelete
        open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}
        title={`حذف ${toDelete?.name ?? ""}؟`} body="ستبقى الطلبات والعملاء المرتبطون لكن دون مكتب مُحيل."
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </>
  );
}

const kindIcon = { new: Bell, upcoming: Clock, waiting: UserCheck, approval: AlertCircle };
const kindTone = { new: "bg-info/12 text-info", upcoming: "bg-warning/15 text-warning", waiting: "bg-primary/12 text-primary", approval: "bg-violet/12 text-violet" };

export function NotificationsPage() {
  const p = usePaths();
  const requests = useRequests();
  const customers = useCustomers().data ?? [];
  if (requests.isLoading) return <Loading />;
  const items = deriveNotifications(requests.data ?? [], customers);
  return (
    <>
      <PageHeader title="الإشعارات" subtitle="تنبيهات تلقائية حسب حالة الطلبات ومواعيد الخدمات" />
      {items.length === 0 ? <EmptyState title="لا توجد إشعارات" body="كل شيء تحت السيطرة" /> : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = kindIcon[n.kind];
            return (
              <li key={n.id}>
                <Link to={p.requests} className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:shadow-sm">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", kindTone[n.kind])}><Icon className="size-4.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="block text-sm text-muted-foreground">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(n.date)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs"><span>{r.label}</span><b>{r.value}</b></div>
          <div className="h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", r.tone ?? "bg-primary")} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const rs = useRequests().data ?? [];
  const bookingsAll = useBookings().data ?? [];
  const cs = useCustomers().data ?? [];
  const services = useServices().data ?? [];
  const partners = usePartners().data ?? [];
  const done = rs.filter((r) => r.status === "completed").length;
  const closed = done + rs.filter((r) => r.status === "cancelled").length;
  const kpis = [
    ["إجمالي الطلبات", rs.length], ["إجمالي العملاء", cs.length], ["الحجوزات", bookingsAll.length],
    ["نسبة الإنجاز", closed ? Math.round((done / closed) * 100) + "%" : "—"],
  ];
  const card = "rounded-xl border bg-card p-5";
  return (
    <>
      <PageHeader title="التقارير" subtitle="مؤشرات أساسية لأداء المكتب" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([k, v]) => <div key={k} className={card}><p className="font-display text-3xl font-bold">{v}</p><p className="text-sm text-muted-foreground">{k}</p></div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}><h2 className="mb-4 font-semibold">الطلبات حسب الحالة</h2>
          <Bars rows={statusOrder.map((s) => ({ label: statusLabels[s], value: rs.filter((r) => r.status === s).length, tone: statusBar[s] }))} />
        </section>
        <section className={card}><h2 className="mb-4 font-semibold">الطلبات حسب الخدمة</h2>
          <Bars rows={services.map((s) => ({ label: s.name, value: rs.filter((r) => r.service_id === s.id).length }))} />
        </section>
        <section className={card}><h2 className="mb-4 font-semibold">مصدر الطلبات</h2>
          <Bars rows={Object.entries(requestSourceLabels).map(([k, v]) => ({ label: v, value: rs.filter((r) => r.source === k).length, tone: "bg-accent" }))} />
        </section>
        <section className={card}><h2 className="mb-4 font-semibold">مصدر العملاء</h2>
          <Bars rows={Object.entries(customerSourceLabels).map(([k, v]) => ({ label: v, value: cs.filter((c) => c.source === k).length, tone: "bg-success" }))} />
        </section>
        <section className={cn(card, "md:col-span-2")}><h2 className="mb-4 font-semibold">الطلبات المحوّلة من المكاتب الشريكة</h2>
          {partners.length ? <Bars rows={partners.map((x) => ({ label: x.name, value: rs.filter((r) => r.referring_partner_id === x.id).length, tone: "bg-info" }))} /> : <p className="text-sm text-muted-foreground">لا توجد مكاتب شريكة</p>}
        </section>
      </div>
    </>
  );
}
