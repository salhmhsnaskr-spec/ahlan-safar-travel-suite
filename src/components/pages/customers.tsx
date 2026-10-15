import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Phone } from "lucide-react";
import { useCustomers, useDeleteCustomer, useMembers, usePartners, usePaths, useRequests } from "@/lib/data/context";
import { EmptyState, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { CustomerDialog } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerSourceLabels, formatDate, type Customer } from "@/lib/domain";

export function CustomersPage() {
  const p = usePaths();
  const { data, isLoading } = useCustomers();
  const requests = useRequests().data ?? [];
  const partners = usePartners().data ?? [];
  const members = useMembers().data ?? [];
  const del = useDeleteCustomer();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const partnerName = new Map(partners.map((x) => [x.id, x.name]));
  const memberName = new Map(members.map((m) => [m.user_id, m.full_name || m.email]));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    requests.forEach((r) => m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + 1));
    return m;
  }, [requests]);

  const list = (data ?? []).filter((c) => {
    const t = q.trim().toLowerCase();
    if (t && ![c.full_name, c.phone, c.email, c.passport_number].some((v) => v?.toLowerCase().includes(t))) return false;
    if (source && c.source !== source) return false;
    if (assignee && c.assigned_to !== assignee) return false;
    return true;
  });

  return (
    <>
      <PageHeader
        title="العملاء"
        subtitle={`${data?.length ?? 0} عميل`}
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> إضافة عميل</Button>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9 bg-card" placeholder="ابحث بالاسم أو الهاتف أو البريد أو الجواز" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">كل المصادر</option>
          {Object.entries(customerSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">كل الموظفين</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </div>
      {isLoading ? <Loading /> : list.length === 0 ? (
        <EmptyState title="لا يوجد عملاء" body="أضف أول عميل للبدء" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={p.customer} params={{ id: c.id }} className="min-w-0">
                  <p className="truncate font-semibold hover:text-primary">{c.full_name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" dir="ltr"><Phone className="size-3" />{c.phone || "—"}</p>
                </Link>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => { setEditing(c); setOpen(true); }}><Pencil /></Button>
                  <Button size="icon" variant="ghost" aria-label="حذف" className="text-danger" onClick={() => setToDelete(c)}><Trash2 /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>المصدر: <b className="text-foreground">{customerSourceLabels[c.source]}</b>{c.referring_partner_id && ` (${partnerName.get(c.referring_partner_id) ?? ""})`}</span>
                <span>الطلبات: <b className="text-foreground">{counts.get(c.id) ?? 0}</b></span>
                <span>المسؤول: <b className="text-foreground">{memberName.get(c.assigned_to ?? "") ?? "—"}</b></span>
                <span>أُضيف: {formatDate(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <CustomerDialog open={open} onOpenChange={setOpen} initial={editing} />
      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`حذف ${toDelete?.full_name ?? ""}؟`}
        body="سيتم حذف العميل وجميع طلباته نهائيًا."
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </>
  );
}
