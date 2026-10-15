import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useBookings, useCustomers, useDeleteRequest, usePartners, usePaths, useRequests, useSaveRequest, useServices } from "@/lib/data/context";
import { EmptyState, Loading, NativeSelect, PageHeader, StatusBadge } from "@/components/kit";
import { RequestDialog } from "@/components/forms";
import { BookingDialog } from "@/components/forms-ops";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bookingCode, bookingStatusLabels, formatDate, priorityLabels, priorityTone, requestCode, requestSourceLabels, statusLabels, statusOrder, statusTone, type TravelRequest,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function RequestRow({ r, onEdit, onDelete }: { r: TravelRequest; onEdit: () => void; onDelete: () => void }) {
  const p = usePaths();
  const customers = useCustomers().data ?? [];
  const services = useServices().data ?? [];
  const partners = usePartners().data ?? [];
  const save = useSaveRequest();
  const customer = customers.find((c) => c.id === r.customer_id);
  const service = services.find((s) => s.id === r.service_id);
  const partner = partners.find((x) => x.id === r.referring_partner_id);
  const linked = (useBookings().data ?? []).filter((b) => b.request_id === r.id);
  const [book, setBook] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">{requestCode(r.number)}</span>
            <span className={cn("text-xs font-medium", priorityTone[r.priority])}>● {priorityLabels[r.priority]}</span>
          </div>
          <p className="mt-1 font-semibold">{service?.name ?? "خدمة"} — {customer ? <Link to={p.customer} params={{ id: customer.id }} className="hover:text-primary">{customer.full_name}</Link> : "—"}</p>
          {r.details && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.details}</p>}
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>المصدر: <b className="text-foreground">{requestSourceLabels[r.source]}</b>{partner && ` (${partner.name})`}</span>
        <span>تاريخ الخدمة: <b className="text-foreground">{formatDate(r.service_date)}</b></span>
        <span>أُنشئ: {formatDate(r.created_at)}</span>
      </div>
      {linked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="text-muted-foreground">الحجوزات المرتبطة:</span>
          {linked.map((b) => (
            <Link key={b.id} to={p.booking} params={{ id: b.id }} className="rounded-full bg-success/12 px-2 py-0.5 text-success">
              <span dir="ltr">{bookingCode(b.number)}</span> · {bookingStatusLabels[b.status]}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <NativeSelect
          aria-label="تغيير الحالة"
          className={cn("h-8 w-auto text-xs font-medium ring-1 ring-inset", statusTone[r.status])}
          value={r.status}
          onChange={(e) => save.mutate({ id: r.id, customer_id: r.customer_id, status: e.target.value as TravelRequest["status"] })}
        >
          {statusOrder.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </NativeSelect>
        {r.status !== "cancelled" && (
          <Button size="sm" variant="outline" onClick={() => setBook(true)}>
            <CalendarCheck /> إنشاء حجز
          </Button>
        )}
        <div className="ms-auto flex gap-1">
          <Button size="icon" variant="ghost" aria-label="تعديل" onClick={onEdit}><Pencil /></Button>
          <Button size="icon" variant="ghost" aria-label="حذف" className="text-danger" onClick={onDelete}><Trash2 /></Button>
        </div>
      </div>
      <BookingDialog open={book} onOpenChange={setBook} initial={book ? { customer_id: r.customer_id, request_id: r.id, service_id: r.service_id, service_date: r.service_date, assigned_employee_id: r.assigned_to } : null} />
    </div>
  );
}

export function RequestList({ list, emptyTitle = "لا توجد طلبات" }: { list: TravelRequest[]; emptyTitle?: string }) {
  const [editing, setEditing] = useState<TravelRequest | null>(null);
  const [toDelete, setToDelete] = useState<TravelRequest | null>(null);
  const del = useDeleteRequest();
  return (
    <>
      {list.length === 0 ? <EmptyState title={emptyTitle} /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => <RequestRow key={r.id} r={r} onEdit={() => setEditing(r)} onDelete={() => setToDelete(r)} />)}
        </div>
      )}
      <RequestDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing} />
      <ConfirmDelete
        open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}
        title="حذف الطلب؟" body="لا يمكن التراجع عن هذه العملية."
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </>
  );
}

export function RequestsPage() {
  const { data, isLoading } = useRequests();
  const customers = useCustomers().data ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const names = new Map(customers.map((c) => [c.id, c.full_name]));
  const all = data ?? [];
  const list = all.filter((r) => {
    if (status && r.status !== status) return false;
    const t = q.trim().toLowerCase();
    if (t && !(requestCode(r.number).toLowerCase().includes(t) || names.get(r.customer_id)?.toLowerCase().includes(t) || r.details?.toLowerCase().includes(t))) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="الطلبات" subtitle={`${all.length} طلب`} actions={<Button onClick={() => setOpen(true)}><Plus /> طلب جديد</Button>} />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {[["", "الكل"] as const, ...statusOrder.map((s) => [s, statusLabels[s]] as const)].map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStatus(k)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", status === k ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
          >
            {v} <span className="opacity-70">({k ? all.filter((r) => r.status === k).length : all.length})</span>
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9 bg-card" placeholder="ابحث برقم الطلب أو اسم العميل" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <Loading /> : <RequestList list={list} />}
      <RequestDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

