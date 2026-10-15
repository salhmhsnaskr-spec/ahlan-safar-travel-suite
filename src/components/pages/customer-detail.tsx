import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { useBookings, useCustomers, useMembers, usePartners, usePaths, useRequests, useServices } from "@/lib/data/context";
import { EmptyState, Loading, StatusBadge } from "@/components/kit";
import { CustomerDialog, RequestDialog } from "@/components/forms";
import { RequestList } from "@/components/pages/requests";
import { BookingTable } from "@/components/pages/bookings";
import { BookingDialog } from "@/components/forms-ops";
import { DocumentsPanel } from "@/components/pages/documents";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerSourceLabels, formatDate, requestCode, statusLabels } from "@/lib/domain";

export function CustomerDetailPage({ id }: { id: string }) {
  const p = usePaths();
  const customers = useCustomers();
  const requests = (useRequests().data ?? []).filter((r) => r.customer_id === id);
  const services = useServices().data ?? [];
  const bookings = (useBookings().data ?? []).filter((b) => b.customer_id === id);
  const [newBooking, setNewBooking] = useState(false);
  const partners = usePartners().data ?? [];
  const members = useMembers().data ?? [];
  const [edit, setEdit] = useState(false);
  const [newReq, setNewReq] = useState(false);
  if (customers.isLoading) return <Loading />;
  const c = customers.data?.find((x) => x.id === id);
  if (!c) return <EmptyState title="العميل غير موجود" action={<Link to={p.customers} className="text-primary">العودة إلى العملاء</Link>} />;

  const partner = partners.find((x) => x.id === c.referring_partner_id);
  const member = members.find((m) => m.user_id === c.assigned_to);
  const usedServices = [...new Set(requests.map((r) => r.service_id))].map((sid) => services.find((s) => s.id === sid)).filter(Boolean);
  const activity = [
    { date: c.created_at, text: "تم إنشاء ملف العميل" },
    ...requests.flatMap((r) => [
      { date: r.created_at, text: `أُنشئ الطلب ${requestCode(r.number)}` },
            ...(r.updated_at !== r.created_at ? [{ date: r.updated_at, text: `آخر تحديث للطلب ${requestCode(r.number)}: ${statusLabels[r.status]}` }] : []),
    ]),
    ...bookings.map((b) => ({ date: b.created_at, text: `تم إنشاء الحجز BK-${String(b.number).padStart(4, "0")}` })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const info: [string, string | null | undefined][] = [
    ["الهاتف", c.phone], ["البريد الإلكتروني", c.email], ["رقم الجواز", c.passport_number], ["الجنسية", c.nationality],
    ["مصدر العميل", customerSourceLabels[c.source] + (partner ? ` — ${partner.name}` : "")],
    ["الموظف المسؤول", member?.full_name || member?.email], ["تاريخ الإنشاء", formatDate(c.created_at)],
  ];

  return (
    <>
      <Link to={p.customers} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> العملاء</Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary font-display text-xl font-bold text-primary-foreground">{c.full_name.slice(0, 1)}</div>
          <div>
            <h1 className="text-2xl font-bold">{c.full_name}</h1>
            <p className="text-sm text-muted-foreground">{requests.length} طلب · {bookings.length} حجز</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewReq(true)}><Plus /> طلب جديد</Button>
          <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> تعديل</Button>
        </div>
      </div>
      <Tabs defaultValue="info" dir="rtl">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="info">البيانات</TabsTrigger>
          <TabsTrigger value="requests">الطلبات</TabsTrigger>
          <TabsTrigger value="bookings">الحجوزات</TabsTrigger>
          <TabsTrigger value="services">الخدمات</TabsTrigger>
          <TabsTrigger value="documents">الوثائق</TabsTrigger>
          <TabsTrigger value="notes">الملاحظات</TabsTrigger>
          <TabsTrigger value="activity">سجل النشاط</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
            {info.map(([k, v]) => (
              <div key={k} className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>
        <TabsContent value="requests"><RequestList list={requests} /></TabsContent>
        <TabsContent value="bookings">
          <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setNewBooking(true)}><Plus /> حجز لهذا العميل</Button></div>
          <BookingTable list={bookings} emptyTitle="لا توجد حجوزات لهذا العميل" />
        </TabsContent>
        <TabsContent value="services">
          {usedServices.length === 0 ? <EmptyState title="لم يطلب العميل أي خدمة بعد" /> : (
            <div className="flex flex-wrap gap-2">
              {usedServices.map((s) => (
                <span key={s!.id} className="rounded-full border bg-card px-4 py-2 text-sm">
                  {s!.name} <span className="text-muted-foreground">({requests.filter((r) => r.service_id === s!.id).length})</span>
                </span>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="documents"><DocumentsPanel links={{ customer_id: c.id }} filter={(d) => d.customer_id === c.id} /></TabsContent>
        <TabsContent value="notes">
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4 text-sm whitespace-pre-wrap">{c.notes || <span className="text-muted-foreground">لا توجد ملاحظات على العميل.</span>}</div>
            {requests.filter((r) => r.notes).map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-4 text-sm">
                <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><span dir="ltr">{requestCode(r.number)}</span><StatusBadge status={r.status} /></p>
                {r.notes}
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <ol className="relative space-y-4 border-s-2 border-border ps-5">
            {activity.map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[27px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
                <p className="text-sm">{a.text}</p>
                <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
      <BookingDialog open={newBooking} onOpenChange={setNewBooking} initial={newBooking ? { customer_id: c.id } : null} />
      <CustomerDialog open={edit} onOpenChange={setEdit} initial={c} />
      <RequestDialog open={newReq} onOpenChange={setNewReq} initial={newReq ? { customer_id: c.id } : null} />
    </>
  );
}
