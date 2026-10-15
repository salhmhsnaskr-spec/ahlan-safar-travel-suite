import { useRef, useState } from "react";
import { Download, ExternalLink, FileText, Search, Trash2, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useBookings, useCustomers, useData, useDeleteDocument, useDocuments, useMembers, usePaths, useUploadDocument } from "@/lib/data/context";
import { EmptyState, Field, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, type DocumentRow } from "@/lib/domain";
import type { DocumentLinks } from "@/lib/data/api";

/** Upload/download/delete files linked to a customer or booking. Files are isolated per office. */
export function DocumentsPanel({ links, filter }: { links: DocumentLinks; filter: (d: DocumentRow) => boolean }) {
  const api = useData();
  const { data, isLoading } = useDocuments();
  const members = new Map((useMembers().data ?? []).map((m) => [m.user_id, m.full_name || m.email || "—"]));
  const upload = useUploadDocument();
  const del = useDeleteDocument();
  const input = useRef<HTMLInputElement>(null);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const list = (data ?? []).filter(filter);

  async function download(d: DocumentRow) {
    try {
      const url = await api.documentUrl(d);
      const a = document.createElement("a");
      a.href = url; a.download = d.file_name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast.error("تعذّر تنزيل الوثيقة", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{list.length} وثيقة · الحد الأقصى {api.mode === "demo" ? "1MB" : "20MB"} للملف</p>
        <input ref={input} type="file" className="hidden" aria-label="اختيار ملف" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate({ file: f, links });
          e.target.value = "";
        }} />
        <Button size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}><Upload /> {upload.isPending ? "جارٍ الرفع…" : "رفع وثيقة"}</Button>
      </div>
      {isLoading ? <Loading /> : list.length === 0 ? <EmptyState title="لا توجد وثائق" body="ارفع جواز السفر أو التذاكر أو أي مستند متعلق." /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {list.map((d) => {
            const canDelete = api.role === "admin" || d.uploaded_by === api.userId;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">{d.file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {members.get(d.uploaded_by ?? "") ?? "—"}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="تنزيل" onClick={() => download(d)}><Download /></Button>
                {canDelete && <Button size="icon" variant="ghost" aria-label="حذف الوثيقة" className="text-danger" onClick={() => setToDelete(d)}><Trash2 /></Button>}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDelete open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="حذف الوثيقة؟" body="سيُحذف الملف نهائيًا."
        onConfirm={() => toDelete && del.mutate(toDelete, { onSuccess: () => setToDelete(null) })} />
    </div>
  );
}

function docKind(d: DocumentRow): string {
  const m = (d.mime_type ?? "").toLowerCase();
  const ext = d.file_name.split(".").pop()?.toLowerCase() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (/word|document|text/.test(m) || ["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  if (/sheet|excel|csv/.test(m) || ["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  return "other";
}
const kindLabels: Record<string, string> = { pdf: "PDF", image: "صورة", doc: "مستند نصي", sheet: "جدول بيانات", other: "أخرى" };

/** Office-wide documents page. Reuses the same DataApi/query cache as the embedded panels, so changes sync everywhere. */
export function DocumentsPage() {
  const api = useData();
  const docs = useDocuments();
  const customers = useCustomers().data ?? [];
  const bookings = useBookings().data ?? [];
  const members = new Map((useMembers().data ?? []).map((m) => [m.user_id, m.full_name || m.email || "—"]));
  const custMap = new Map(customers.map((c) => [c.id, c.full_name]));
  const bookMap = new Map(bookings.map((b) => [b.id, b]));
  const upload = useUploadDocument();
  const del = useDeleteDocument();
  const input = useRef<HTMLInputElement>(null);
  const p = usePaths();
  const [q, setQ] = useState("");
  const [cust, setCust] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [upCust, setUpCust] = useState("");
  const [upBook, setUpBook] = useState("");
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);

  const term = q.trim().toLowerCase();
  const list = (docs.data ?? []).filter((d) => {
    if (term && !d.file_name.toLowerCase().includes(term) && !(custMap.get(d.customer_id ?? "") ?? "").toLowerCase().includes(term)) return false;
    if (cust && d.customer_id !== cust) return false;
    if (kind && docKind(d) !== kind) return false;
    const day = d.created_at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  const upBookings = bookings.filter((b) => !upCust || b.customer_id === upCust);

  async function open(d: DocumentRow, dl: boolean) {
    try {
      const url = await api.documentUrl(d);
      const a = document.createElement("a");
      a.href = url; a.rel = "noopener"; if (dl) a.download = d.file_name; else a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast.error("تعذّر فتح الوثيقة", { description: (e as Error).message });
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="المستندات" subtitle="جميع مستندات المكتب في مكان واحد" />
      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">رفع مستند جديد</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="العميل (اختياري)">
            <NativeSelect value={upCust} onChange={(e) => { setUpCust(e.target.value); setUpBook(""); }}>
              <option value="">بدون عميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="الحجز (اختياري)">
            <NativeSelect value={upBook} onChange={(e) => setUpBook(e.target.value)}>
              <option value="">بدون حجز</option>
              {upBookings.map((b) => <option key={b.id} value={b.id}>#{b.number} — {custMap.get(b.customer_id) ?? ""}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex items-end">
            <input ref={input} type="file" className="hidden" aria-label="اختيار ملف" onChange={(e) => {
              const f = e.target.files?.[0];
              const b = upBook ? bookMap.get(upBook) : undefined;
              if (f) upload.mutate({ file: f, links: { customer_id: upCust || b?.customer_id || null, booking_id: upBook || null } });
              e.target.value = "";
            }} />
            <Button className="w-full" disabled={upload.isPending} onClick={() => input.current?.click()}><Upload /> {upload.isPending ? "جارٍ الرفع…" : "اختيار ملف ورفعه"}</Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">الحد الأقصى {api.mode === "demo" ? "1MB" : "20MB"} للملف</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="بحث" className="sm:col-span-2 lg:col-span-1">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الملف أو العميل" className="ps-9" />
          </div>
        </Field>
        <Field label="العميل">
          <NativeSelect value={cust} onChange={(e) => setCust(e.target.value)}>
            <option value="">الكل</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="نوع الملف">
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(kindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="من تاريخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      {docs.isLoading ? <Loading /> : docs.isError ? (
        <EmptyState title="تعذّر تحميل المستندات" body={(docs.error as Error).message} action={<Button variant="outline" onClick={() => docs.refetch()}>إعادة المحاولة</Button>} />
      ) : list.length === 0 ? (
        <EmptyState title={(docs.data ?? []).length ? "لا توجد نتائج مطابقة" : "لا توجد مستندات بعد"} body={(docs.data ?? []).length ? "غيّر معايير البحث أو التصفية." : "ارفع جواز السفر أو التذاكر أو أي مستند للمكتب."} />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{list.length} مستند</p>
          <ul className="divide-y rounded-xl border bg-card">
            {list.map((d) => {
              const canDelete = api.role === "admin" || d.uploaded_by === api.userId;
              const b = d.booking_id ? bookMap.get(d.booking_id) : undefined;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <FileText className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium" dir="auto">{d.file_name}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {kindLabels[docKind(d)]} · {formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {members.get(d.uploaded_by ?? "") ?? "—"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {d.customer_id && custMap.get(d.customer_id) ? (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        <Link to={p.customer as any} params={{ id: d.customer_id } as any} className="text-primary hover:underline">العميل: {custMap.get(d.customer_id)}</Link>
                      ) : <span className="text-muted-foreground">بدون عميل</span>}
                      {b && (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        <Link to={p.booking as any} params={{ id: b.id } as any} className="text-primary hover:underline">الحجز #{b.number}</Link>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button size="icon" variant="ghost" aria-label="فتح" onClick={() => open(d, false)}><ExternalLink /></Button>
                    <Button size="icon" variant="ghost" aria-label="تنزيل" onClick={() => open(d, true)}><Download /></Button>
                    {canDelete && <Button size="icon" variant="ghost" aria-label="حذف الوثيقة" className="text-danger" onClick={() => setToDelete(d)}><Trash2 /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ConfirmDelete open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="حذف الوثيقة؟" body="سيُحذف الملف نهائيًا."
        onConfirm={() => toDelete && del.mutate(toDelete, { onSuccess: () => setToDelete(null) })} />
    </div>
  );
}
