/** Document file types an office may upload; mirrored by the database check `document_file_allowed`. */
export const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "ods"] as const;

export function documentExtension(name: string) {
  return name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? "";
}

export function isAllowedDocument(name: string) {
  return (ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(documentExtension(name));
}

export function assertAllowedDocument(file: { name: string; size: number }) {
  if (file.size === 0) throw new Error("الملف فارغ، اختر ملفًا آخر.");
  if (!isAllowedDocument(file.name)) throw new Error("نوع الملف غير مسموح. المسموح: PDF والصور (JPG، PNG، WEBP، HEIC) وملفات Word وExcel وCSV والنصوص.");
}

/** Types a browser can show inline; everything else is downloaded. */
export function isPreviewable(name: string) {
  return ["pdf", "jpg", "jpeg", "png", "webp", "gif", "txt"].includes(documentExtension(name));
}

export const DOCUMENT_ACCEPT = ALLOWED_DOCUMENT_EXTENSIONS.map((e) => "." + e).join(",");
