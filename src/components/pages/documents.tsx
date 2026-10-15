import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useData, useDeleteDocument, useDocuments, useMembers, useUploadDocument } from "@/lib/data/context";
import { EmptyState, Loading } from "@/components/kit";
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
