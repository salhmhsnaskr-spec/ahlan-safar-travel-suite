import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/kit";
import { useRequests, useServices } from "@/lib/data/context";
import { requestCode } from "@/lib/domain";
import { visibleFields, type ServiceDetails, type TxField } from "@/lib/transaction";

/** Service-specific inputs shared by the new-request dialog and the transaction screens. */
export function ServiceDetailFields({ fields, d, setD, customerId, selfId }: {
  fields: TxField[]; d: ServiceDetails; setD: (f: (s: ServiceDetails) => ServiceDetails) => void; customerId?: string | undefined; selfId?: string | undefined;
}) {
  const allServices = useServices().data ?? [];
  const requests = useRequests();
  const shown = visibleFields(fields, d);
  if (!shown.length) return null;
  const set = (key: string, value: string) => setD((s) => ({ ...s, [key]: value }));
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {shown.map((f) => (
        <Field key={f.key} label={f.label + (f.required ? " *" : "")} {...(f.type === "textarea" ? { className: "sm:col-span-2" } : {})}>
          {f.type === "request" ? (() => {
            const opts = (requests.data ?? []).filter((x) => x.id !== selfId && x.customer_id === customerId && f.linkCodes?.includes(allServices.find((s) => s.id === x.service_id)?.code ?? ""));
            return !customerId ? <p className="text-sm text-muted-foreground">اختر العميل أولًا.</p>
              : opts.length === 0 && !d[f.key] ? <p className="text-sm text-muted-foreground">لا يوجد طلب تأشيرة زيارة لهذا العميل.</p>
              : (
                <NativeSelect aria-label={f.label} value={d[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">— بدون ربط —</option>
                  {opts.map((x) => <option key={x.id} value={x.id}>{requestCode(x.number)}</option>)}
                  {d[f.key] && !opts.some((x) => x.id === d[f.key]) && <option value={d[f.key]}>طلب مرتبط سابقًا</option>}
                </NativeSelect>
              );
          })() : f.type === "select" ? (
            <NativeSelect aria-label={f.label} required={f.required} value={d[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">— اختر —</option>
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </NativeSelect>
          ) : f.type === "textarea" ? (
            <Textarea aria-label={f.label} rows={2} value={d[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          ) : (
            <Input aria-label={f.label} type={f.type} min={f.type === "number" ? 0 : undefined} dir={f.ltr ? "ltr" : undefined} className={f.ltr ? "text-end" : undefined}
              value={d[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          )}
        </Field>
      ))}
    </div>
  );
}
