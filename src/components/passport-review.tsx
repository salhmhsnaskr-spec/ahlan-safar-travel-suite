import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/kit";
import { useData, useSaveCustomer } from "@/lib/data/context";
import { useWorkAccess } from "@/components/work-permission-control";
import type { Customer } from "@/lib/domain";
import { extractPassport } from "@/lib/passport.functions";
import { PASSPORT_MAX_BYTES, reviewedPassport, validatePassportImage, type PassportValues } from "@/lib/passport";

export function PassportReview({ customer, onBusy }: { customer: Customer; onBusy: (busy: boolean) => void }) {
  const api = useData();
  const allowed = useWorkAccess();
  const extract = useServerFn(extractPassport);
  const save = useSaveCustomer();
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [image, setImage] = useState("");
  const [values, setValues] = useState<PassportValues | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (api.mode !== "cloud") return <p className="text-sm text-muted-foreground sm:col-span-2">قراءة الجواز متاحة داخل المكتب بعد تسجيل الدخول فقط.</p>;
  if (customer.office_id !== api.officeId || !allowed("customers", customer, "edit")) return null;
  const edit = (key: keyof PassportValues, value: string) => {
    setValues(old => old ? { ...old, [key]: value } : old); setConfirmed(false); setSaved(false);
  };
  return <section className="space-y-3 border-t pt-4 sm:col-span-2" aria-label="قراءة الجواز">
    <h3 className="font-semibold">بيانات الجواز</h3>
    <p className="text-xs text-muted-foreground">تُرسل الصورة إلى AI Gateway لقراءتها ولا تُحفظ كمرفق. قد تخطئ القراءة؛ راجع القيم قبل تأكيد الحفظ.</p>
    <input ref={input} aria-label="صورة الجواز" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy || save.isPending} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      setError(""); setValues(null); setImage(""); setConfirmed(false); setSaved(false);
      const current = ++generation.current;
      setBusy(true); onBusy(true);
      try {
        if (file.size > PASSPORT_MAX_BYTES) throw new Error("الحد الأقصى للصورة 5 ميغابايت.");
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذّر فتح الصورة."));
          reader.onerror = () => reject(new Error("تعذّر فتح الصورة.")); reader.readAsDataURL(file);
        });
        validatePassportImage(dataUrl);
        setImage(dataUrl);
        const officeId = api.officeId;
        if (!officeId) throw new Error("اختر المكتب أولًا.");
        const result = await extract({ data: { officeId, customerId: customer.id, image: dataUrl } });
        if (generation.current === current) setValues(result);
      } catch (err) {
        if (generation.current === current) setError(err instanceof Error ? err.message : "تعذّرت قراءة الصورة.");
      } finally { if (generation.current === current) { setBusy(false); onBusy(false); } }
    }} />
    <Button type="button" variant="outline" disabled={busy || save.isPending} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="animate-spin" /> : <ScanLine />}{busy ? "جارٍ قراءة الجواز…" : "استخراج من صورة الجواز"}</Button>
    {image && <img src={image} alt="صورة الجواز للمراجعة" className="max-h-56 w-full object-contain" />}
    {values && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="الاسم الكامل" className="sm:col-span-2"><Input aria-label="الاسم المستخرج" maxLength={200} value={values.full_name} onChange={e => edit("full_name", e.target.value)} disabled={save.isPending} /></Field>
      <Field label="رقم الجواز"><Input aria-label="رقم الجواز المستخرج" dir="ltr" maxLength={40} value={values.passport_number} onChange={e => edit("passport_number", e.target.value)} disabled={save.isPending} /></Field>
      <Field label="الجنسية"><Input aria-label="الجنسية المستخرجة" maxLength={100} value={values.nationality} onChange={e => edit("nationality", e.target.value)} disabled={save.isPending} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={confirmed} disabled={save.isPending} onCheckedChange={value => setConfirmed(value === true)} />راجعت القيم مع الجواز وأؤكد صحتها لهذا المعتمر</label>
      <p className="text-xs text-muted-foreground sm:col-span-2">سيُحدّث الاسم ورقم الجواز والجنسية للعميل المحدد: {customer.full_name}؛ تبقى بقية بياناته دون تغيير.</p>
      <Button type="button" disabled={!confirmed || !values.full_name.trim() || save.isPending || saved} onClick={async () => {
        setError(""); onBusy(true);
        try { const fields = reviewedPassport(values, confirmed); await save.mutateAsync({ id: customer.id, ...fields }); setSaved(true); setConfirmed(false); setImage(""); }
        catch (err) { setError(err instanceof Error ? err.message : "تعذّر حفظ البيانات."); }
        finally { onBusy(false); }
      }}> {save.isPending ? "جارٍ الحفظ…" : "تأكيد وحفظ بيانات الجواز"}</Button>
    </div>}
    {saved && <p role="status" className="text-sm text-success">تم حفظ البيانات المؤكدة داخل المكتب.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}