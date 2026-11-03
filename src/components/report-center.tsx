import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activityActionLabels, bookingStatusLabels, statusLabels } from "@/lib/domain";
import { buildSheet, presetPeriod, reportKindLabels, type ReportFilters, type ReportKind, type ReportSource, type Sheet } from "@/lib/reports";
import { downloadWorkbook } from "@/lib/excel";

const kinds = Object.keys(reportKindLabels) as ReportKind[];
const esc = (v: unknown) => String(v ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function periodLabel(f: ReportFilters) {
  return f.from || f.to ? `${f.from || "البداية"} ← ${f.to || "اليوم"}` : "كل الفترات";
}

/** Opens a print-ready Arabic page (browser "Save as PDF") with office identity, period and the chosen tables. */
export function printSheets(sheets: Sheet[], meta: { officeName: string; logoUrl?: string | null | undefined; period: string; title: string }) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("اسمح بفتح النوافذ المنبثقة لطباعة التقرير."); return; }
  const tables = sheets.map((s) => `<h2>${esc(s.name)} <small>(${s.rows.length})</small></h2>
    ${(s.totals ?? []).map(([k, v]) => `<span class="t">${esc(k)}: <b>${esc(v)}</b></span>`).join(" ")}
    <table><thead><tr>${s.columns.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${s.rows.map((r) => `<tr>${r.map((v, i) => `<td${s.columns[i]?.kind === "phone" ? ' dir="ltr"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${s.columns.length}">لا توجد سجلات</td></tr>`}</tbody></table>`).join("");
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
  <style>@page{size:A4 landscape;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;font-size:10px;color:#111}
  header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0f5e5a;padding-bottom:8px;margin-bottom:10px}
  header img{height:56px;max-width:120px;object-fit:contain}h1{font-size:18px;margin:0}h2{font-size:13px;margin:16px 0 4px;color:#0f5e5a}
  table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#0f5e5a;color:#fff;padding:4px}td{border:1px solid #ccc;padding:3px}
  tr:nth-child(even) td{background:#f4f7f7}.t{margin-inline-end:12px}thead{display:table-header-group}</style></head><body>
  <header>${meta.logoUrl ? `<img src="${esc(meta.logoUrl)}" alt="">` : ""}<div><h1>${esc(meta.officeName)}</h1>
  <div>${esc(meta.title)} · الفترة: ${esc(meta.period)} · تاريخ الاستخراج: ${esc(new Date().toLocaleString("ar"))}</div></div></header>
  ${tables}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}

export function ReportCenter({ source, title = "تقرير المكتب" }: { source: ReportSource; title?: string }) {
  const [selected, setSelected] = useState<ReportKind[]>(["customers", "requests", "bookings"]);
  const [f, setF] = useState<ReportFilters>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ReportFilters) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value || undefined }));
  const sheets = () => selected.map((k) => buildSheet(k, source, f));
  const meta = { officeName: source.office.name, period: periodLabel(f), title };
  const statuses = { ...statusLabels, ...bookingStatusLabels };
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 font-semibold">تصدير التقارير</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {kinds.map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input type="checkbox" checked={selected.includes(k)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, k] : s.filter((x) => x !== k))} />
            {reportKindLabels[k]}
          </label>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([["day", "اليوم"], ["week", "الأسبوع"], ["month", "الشهر"], ["year", "السنة"]] as const).map(([p, l]) => (
          <Button key={p} size="sm" variant="outline" onClick={() => setF((s) => ({ ...s, ...presetPeriod(p) }))}>{l}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setF((s) => ({ ...s, from: undefined, to: undefined }))}>كل الفترات</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="من تاريخ"><Input type="date" value={f.from ?? ""} onChange={set("from")} /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={f.to ?? ""} onChange={set("to")} /></Field>
        <Field label="الموظف"><NativeSelect aria-label="الموظف" value={f.employee ?? ""} onChange={set("employee")}><option value="">كل الموظفين</option>{source.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect></Field>
        <Field label="نوع الخدمة"><NativeSelect aria-label="نوع الخدمة" value={f.serviceId ?? ""} onChange={set("serviceId")}><option value="">كل الخدمات</option>{source.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="حالة المعاملة"><NativeSelect aria-label="حالة المعاملة" value={f.status ?? ""} onChange={set("status")}><option value="">كل الحالات</option>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
        <Field label="نوع النشاط"><NativeSelect aria-label="نوع النشاط" value={f.action ?? ""} onChange={set("action")}><option value="">كل الأنشطة</option>{Object.entries(activityActionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">الفترة: {meta.period}. الأسماء مأخوذة من سجلات الفريق والنشاط الفعلية؛ ما لا يُعرف منفذه يظهر «غير معروف».</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={!selected.length || busy} onClick={async () => { setBusy(true); try { await downloadWorkbook(sheets(), meta); } catch (e) { toast.error("تعذّر إنشاء ملف Excel", { description: (e as Error).message }); } finally { setBusy(false); } }}>
          <FileSpreadsheet /> {busy ? "جارٍ الإنشاء…" : "تصدير Excel"}
        </Button>
        <Button variant="outline" disabled={!selected.length} onClick={() => printSheets(sheets(), { ...meta, logoUrl: source.office.logo_url })}><Printer /> طباعة / PDF</Button>
      </div>
    </section>
  );
}
