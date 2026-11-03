import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useData, useOffice, useRemoveLogo, useSaveOffice, useUploadLogo } from '@/lib/data/context';
import { EmptyState, Field, Loading, PageHeader } from '@/components/kit';
import { OfficeDeleteControl } from '@/components/office-delete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { OfficeInput } from '@/lib/data/api';

export const Route = createFileRoute('/_authenticated/app/office')({
  head: () => ({ meta: [{ title: 'إعدادات المكتب — أهلًا سفر' }, { name: 'description', content: 'هوية المكتب وشعاره وبيانات التواصل في أهلًا سفر.' }, { property: 'og:title', content: 'إعدادات المكتب — أهلًا سفر' }, { property: 'og:description', content: 'هوية المكتب وبيانات التواصل.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: OfficeSettings,
});

const blank: Required<{ [K in keyof OfficeInput]: string }> = { name: '', phone: '', whatsapp: '', email: '', address: '', city: '', country: '', location_url: '', website: '', description: '' };

export function OfficeSettings() {
  const api = useData();
  const navigate = useNavigate();
  const office = useOffice();
  const save = useSaveOffice();
  const upload = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (office.data) setF(Object.fromEntries(Object.keys(blank).map((k) => [k, (office.data as Record<string, unknown>)[k] ?? ''])) as typeof blank);
  }, [office.data]);
  if (api.role !== 'admin') return <EmptyState title="غير مصرح" body="إعدادات المكتب متاحة لمدير المكتب فقط." />;
  if (office.isLoading) return <Loading />;
  if (office.isError) return <EmptyState title="تعذّر تحميل بيانات المكتب" body={office.error.message} action={<Button onClick={() => office.refetch()}>إعادة المحاولة</Button>} />;
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const logo = office.data?.logo_url;
  return (
    <>
      <PageHeader title="إعدادات المكتب" subtitle="هوية المكتب تظهر في لوحة التحكم والتقارير المطبوعة" />
      <div className="mx-auto grid max-w-3xl gap-4">
        <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
          <div className="grid size-24 place-items-center overflow-hidden rounded-xl border bg-muted">
            {logo ? <img src={logo} alt={`شعار ${f.name}`} className="size-full object-contain" /> : <ImagePlus className="size-8 text-muted-foreground" />}
          </div>
          <div className="space-y-2">
            <p className="font-semibold">شعار المكتب</p>
            <p className="text-xs text-muted-foreground">PNG أو JPG أو WEBP أو SVG، بحد أقصى 2MB.</p>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label="ملف الشعار"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ''; }} />
              <Button size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}><ImagePlus /> {logo ? 'استبدال الشعار' : 'رفع شعار'}</Button>
              {logo && <Button size="sm" variant="outline" className="text-danger" disabled={removeLogo.isPending} onClick={() => removeLogo.mutate(undefined)}><Trash2 /> حذف الشعار</Button>}
            </div>
          </div>
        </section>
        <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          const input = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as OfficeInput;
          save.mutate({ ...input, name: f.name });
        }}>
          <Field label="الاسم التجاري للمكتب *" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} /></Field>
          <Field label="رقم الهاتف"><Input dir="ltr" className="text-end" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="رقم واتساب"><Input dir="ltr" className="text-end" placeholder="+967..." value={f.whatsapp} onChange={set('whatsapp')} /></Field>
          <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" className="text-end" value={f.email} onChange={set('email')} /></Field>
          <Field label="الموقع الإلكتروني"><Input dir="ltr" className="text-end" value={f.website} onChange={set('website')} /></Field>
          <Field label="الدولة"><Input value={f.country} onChange={set('country')} /></Field>
          <Field label="المدينة"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="العنوان" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="رابط الموقع على الخريطة" className="sm:col-span-2"><Input dir="ltr" className="text-end" placeholder="https://maps.google.com/..." value={f.location_url} onChange={set('location_url')} /></Field>
          <Field label="وصف تعريفي للمكتب" className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={set('description')} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}><Save /> {save.isPending ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</Button></div>
        </form>
        {api.mode === 'cloud' && import.meta.env['VITE_LOCAL_PERMANENT_DELETION'] === '1' && (
          <section className="rounded-xl border border-danger/30 bg-card p-4"><h2 className="mb-2 font-semibold">منطقة الخطر</h2>
            <OfficeDeleteControl name={f.name} remove={api.deleteOffice} onComplete={() => navigate({ to: '/app', replace: true })} /></section>
        )}
      </div>
    </>
  );
}
