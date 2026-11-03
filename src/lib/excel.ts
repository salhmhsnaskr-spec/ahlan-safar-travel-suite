import type { Sheet } from "@/lib/reports";

export type WorkbookMeta = { officeName: string; period: string; title: string };

/** Builds an RTL Arabic workbook: summary sheet + one sheet per report, frozen headers, filters, text-safe phones. */
export async function downloadWorkbook(sheets: Sheet[], meta: WorkbookMeta) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "أهلًا سفر";
  wb.created = new Date();
  const font = { name: "Arial", size: 11 };
  const head = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F5E5A" } };

  const summary = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  summary.columns = [{ width: 32 }, { width: 22 }];
  summary.addRow([meta.title]).font = { ...font, size: 15, bold: true };
  summary.addRow(["المكتب", meta.officeName]);
  summary.addRow(["فترة التقرير", meta.period]);
  summary.addRow(["تاريخ الاستخراج", new Date().toLocaleString("ar")]);
  summary.addRow([]);
  for (const s of sheets) {
    summary.addRow([s.name]).font = { ...font, bold: true };
    for (const [k, v] of s.totals ?? [["عدد السجلات", s.rows.length]]) summary.addRow([k, v]);
    summary.addRow([]);
  }

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width }));
    const hr = ws.getRow(1);
    hr.font = head; hr.fill = fill; hr.height = 22;
    hr.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    for (const r of s.rows) {
      const row = ws.addRow(r.map((v, i) => {
        const kind = s.columns[i]?.kind;
        if (v === null || v === undefined || v === "") return null;
        if (kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00Z");
        if (kind === "number") return Number(v);
        return String(v);
      }));
      row.font = font;
      s.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.kind === "phone") { cell.numFmt = "@"; cell.alignment = { horizontal: "left" }; }
        if (c.kind === "date") cell.numFmt = "yyyy-mm-dd";
      });
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.title} - ${meta.officeName} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
