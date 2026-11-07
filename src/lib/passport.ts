import { z } from "zod";

export const PASSPORT_MAX_BYTES = 5 * 1024 * 1024;
export const passportValuesSchema = z.object({
  full_name: z.string().max(200),
  passport_number: z.string().max(40),
  nationality: z.string().max(100),
}).strict();
export type PassportValues = z.infer<typeof passportValuesSchema>;
export const passportInputSchema = z.object({
  officeId: z.string().uuid(), customerId: z.string().uuid(),
  image: z.string().max(Math.ceil(PASSPORT_MAX_BYTES / 3) * 4 + 100),
}).strict();

// Only inline images: never let the model fetch caller-controlled URLs.
export function validatePassportImage(image: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match?.[2]) throw new Error("اختر صورة JPG أو PNG أو WebP صالحة.");
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  if (bytes.length > PASSPORT_MAX_BYTES || bytes.length < 12) throw new Error("حجم الصورة غير صالح؛ الحد الأقصى 5 ميغابايت.");
  const valid = match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === "png" ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
    : String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  if (!valid) throw new Error("محتوى الملف لا يطابق نوع الصورة.");
  return image;
}

export function reviewedPassport(values: PassportValues, confirmed: boolean) {
  if (!confirmed) throw new Error("راجع البيانات وأكّد صحتها قبل الحفظ.");
  const clean = passportValuesSchema.parse(values);
  if (!clean.full_name.trim()) throw new Error("أدخل الاسم الكامل.");
  return { full_name: clean.full_name.trim(), passport_number: clean.passport_number.trim() || null, nationality: clean.nationality.trim() || null };
}