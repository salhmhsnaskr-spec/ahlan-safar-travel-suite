import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Download, Printer, ArrowUpDown } from 'lucide-react';
import { useData, usePaths, usePerformance, useServices } from '@/lib/data/context';
import { Field, NativeSelect, ReadState, EmptyState } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, activityActionLabels, activityEntityLabels, statusLabels } from '@/lib/domain';
import { csvCell, filterPerformance, metricLabels, performanceRange, type Metric, type PerformanceEntry } from '@/lib/performance';

export function PerformancePage() {
  const api = useData();
  const query = usePerformance();
  const services = useServices();
  const paths = usePaths();
  const [period,setPeriod] = useState('all');
  const [filters,setFilters] = useState({from:'',to:'',actor:'',entity:'',status:'',service:''});
  const [sort,setSort] = useState<Metric>('requests_completed');
  const [details,setDetails] = useState<{title:string;rows:PerformanceEntry[]} | null>(null);
  const [profile,setProfile] = useState<string | null>(null);
  const data = query.data;
  const entries = data ? filterPerformance(data,filters) : [];
  const members = (data?.members ?? []).filter(m=>!filters.actor || m.user_id===filters.actor);
  const known = new Set((data?.members ?? []).map(m=>m.user_id));
  const attributed = entries.filter(e=>e.actor_id && known.has(e.actor_id));
  const unknown = entries.filter(e=>!e.actor_id || !known.has(e.actor_id));
  const metrics = Object.keys(metricLabels) as Metric[];
  const count = (actor:string,metric:Metric) => attributed.filter(e=>e.actor_id===actor && e.metric===metric).length;
  const sorted = members.slice().sort((a,b)=>count(b.user_id,sort)-count(a.user_id,sort) || (a.full_name??'').localeCompare(b.full_name??''));
  const update = (key:keyof typeof filters,value:string) => setFilters(f=>({...f,[key]:value}));
  const invalid = Boolean(filters.from && filters.to && filters.from>filters.to);
  const trend = new Map<string,{requests:number;bookings:number}>();
  attributed.filter(e=>e.metric==='requests_completed'||e.metric==='bookings_completed').forEach(e=>{
    const month=e.at.slice(0,7); const v=trend.get(month)??{requests:0,bookings:0};
    if(e.metric==='requests_completed') v.requests++; else v.bookings++;
    trend.set(month,v);
  });
  const exportCsv = () => {
    const rows = [['الموظف','حالة العضوية',...metrics.map(m=>metricLabels[m])],...sorted.map(m=>[m.full_name??m.user_id,m.status,...metrics.map(k=>count(m.user_id,k))]),[],['السجل','المؤشر','المنفذ','الحالة','التاريخ','المعرف'],...entries.map(e=>[e.label,metricLabels[e.metric],data?.members.find(m=>m.user_id===e.actor_id)?.full_name??'غير منسوب',e.status,e.at,e.entity_id])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='ahlan-safar-performance.csv';a.click();URL.revokeObjectURL(url);
  };
  const stateName = (s:string) => s==='removed'?'موظف سابق':s==='suspended'?'موقوف':'نشط';
  const statusName = (s:string|null) => s ? (statusLabels as Record<string,string>)[s] ?? (s==='awaiting_confirmation'?'بانتظار التأكيد':s) : '—';
  const timeline = (data?.activity ?? []).filter(a=>a.actor_id===profile && (!filters.entity||a.entity===filters.entity) && (!filters.from||a.created_at>=filters.from+'T00:00:00Z') && (!filters.to||Date.parse(a.created_at)<Date.parse(filters.to+'T00:00:00Z')+86400000));
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{api.role==='admin'?'أداء الفريق':'أدائي'}</h2><div className="flex gap-2 print:hidden"><Button variant="outline" size="icon" aria-label="تصدير CSV" title="تصدير CSV" disabled={!data||invalid||query.isError} onClick={exportCsv}><Download/></Button><Button variant="outline" size="icon" aria-label="طباعة PDF" title="طباعة PDF" disabled={!data||invalid||query.isError} onClick={()=>window.print()}><Printer/></Button></div></div>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
      <Field label="الفترة (UTC)"><NativeSelect aria-label="الفترة" value={period} onChange={e=>{const p=e.target.value;setPeriod(p);setFilters(f=>({...f,...(p==='all'?{from:'',to:''}:p==='custom'?{from:f.from,to:f.to}:performanceRange(p))}));}}><option value="all">كل الفترات</option><option value="day">اليوم</option><option value="week">آخر 7 أيام</option><option value="month">الشهر الحالي</option><option value="year">السنة الحالية</option><option value="custom">فترة مخصصة</option></NativeSelect></Field>
      <Field label="من"><Input aria-label="من تاريخ" type="date" value={filters.from} onChange={e=>{setPeriod('custom');update('from',e.target.value);}}/></Field>
      <Field label="إلى (شامل)"><Input aria-label="إلى تاريخ" type="date" value={filters.to} onChange={e=>{setPeriod('custom');update('to',e.target.value);}}/></Field>
      <Field label="الموظف"><NativeSelect aria-label="الموظف" value={filters.actor} onChange={e=>update('actor',e.target.value)}><option value="">{api.role==='admin'?'كل الفريق':'حسابي'}</option>{data?.members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name??m.user_id} · {stateName(m.status)}</option>)}</NativeSelect></Field>
      <Field label="نوع السجل"><NativeSelect aria-label="نوع السجل" value={filters.entity} onChange={e=>update('entity',e.target.value)}><option value="">كل الأنواع</option>{Object.entries(activityEntityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
      <Field label="الحالة الحالية"><NativeSelect aria-label="الحالة الحالية" value={filters.status} onChange={e=>update('status',e.target.value)}><option value="">كل الحالات</option><option value="new">جديد</option><option value="in_progress">قيد المعالجة</option><option value="awaiting_customer">بانتظار العميل</option><option value="awaiting_approval">بانتظار الموافقة</option><option value="awaiting_confirmation">بانتظار التأكيد</option><option value="confirmed">مؤكد</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></NativeSelect></Field>
      <Field label="الخدمة"><NativeSelect aria-label="الخدمة" value={filters.service} onChange={e=>update('service',e.target.value)}><option value="">كل الخدمات</option>{services.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
      <Field label="ترتيب حسب"><NativeSelect aria-label="ترتيب حسب" value={sort} onChange={e=>setSort(e.target.value as Metric)}>{metrics.map(k=><option key={k} value={k}>{metricLabels[k]}</option>)}</NativeSelect></Field>
    </div>
    {invalid?<p role="alert" className="text-danger">تاريخ البداية يجب ألا يأتي بعد تاريخ النهاية.</p>:<ReadState queries={[query,services]} title="تعذّر تحميل أداء الموظفين">
      <p className="mb-4 text-xs text-muted-foreground">الفترة حسب تاريخ الإنشاء أو الإكمال أو الإلغاء أو التعديل (UTC). المعلّق حسب تاريخ إنشائه وإسناده الحالي، وليس إنجازًا. الإكمال يُحتسب مرة واحدة للسجل المكتمل الآن؛ أحداثه السابقة تبقى في السجل.</p>
      <div className="overflow-x-auto border-y"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="p-3 text-start">الموظف</th>{metrics.map(k=><th key={k} className="min-w-24 p-2"><Button variant="ghost" className="h-auto whitespace-normal text-xs" onClick={()=>setSort(k)}>{metricLabels[k]}<ArrowUpDown className="size-3 shrink-0"/></Button></th>)}<th className="min-w-28 p-3">آخر نشاط</th></tr></thead><tbody>{sorted.map(m=><tr key={m.user_id} className="border-t"><td className="min-w-40 p-3"><Button variant="link" className="h-auto px-0 whitespace-normal text-start" onClick={()=>setProfile(m.user_id)}>{m.full_name??'هوية غير متوفرة'}</Button><p className="text-xs text-muted-foreground">{stateName(m.status)}</p></td>{metrics.map(k=><td key={k} className="p-2 text-center"><Button variant="ghost" aria-label={`${metricLabels[k]} — ${m.full_name??m.user_id}`} onClick={()=>setDetails({title:`${metricLabels[k]} — ${m.full_name??m.user_id}`,rows:attributed.filter(e=>e.actor_id===m.user_id&&e.metric===k)})}>{count(m.user_id,k)}</Button></td>)}<td className="p-3 text-xs">{formatDate(m.last_activity_at)}</td></tr>)}</tbody></table></div>
      {!sorted.length&&<EmptyState title="لا توجد عضويات مطابقة"/>}
      <section className="mt-6 border-b pb-5"><h3 className="mb-3 font-semibold">الأكثر حسب نوع العمل</h3><div className="grid gap-3 sm:grid-cols-3">{(['customers_created','requests_completed','bookings_completed'] as Metric[]).map(k=>{const max=Math.max(0,...members.map(m=>count(m.user_id,k)));const leaders=members.filter(m=>max>0&&count(m.user_id,k)===max);return <div key={k}><p className="text-xs text-muted-foreground">{metricLabels[k]}</p><p className="mt-1 text-sm">{leaders.length?leaders.map(m=>m.full_name??m.user_id).join('، ')+' · '+max:'—'}</p></div>;})}</div></section>
      <section className="mt-6"><h3 className="mb-3 font-semibold">تطور الإكمال الحالي حسب شهر الإكمال</h3>{trend.size?<div className="space-y-3">{Array.from(trend).sort(([a],[b])=>a.localeCompare(b)).map(([month,v])=><div key={month} className="grid grid-cols-[80px_1fr] items-center gap-3 text-xs"><span>{month}</span><div className="grid gap-1"><div className="flex items-center gap-2"><progress aria-label={`طلبات ${month}`} className="h-2 w-full accent-primary" value={v.requests} max={Math.max(1,...Array.from(trend.values()).map(v=>Math.max(v.requests,v.bookings)))}/><span className="min-w-20">طلبات: {v.requests}</span></div><div className="flex items-center gap-2"><progress aria-label={`حجوزات ${month}`} className="h-2 w-full accent-accent" value={v.bookings} max={Math.max(1,...Array.from(trend.values()).map(v=>Math.max(v.requests,v.bookings)))}/><span className="min-w-20">حجوزات: {v.bookings}</span></div></div></div>)}</div>:<p className="text-sm text-muted-foreground">لا يوجد إكمال منسوب في الفترة.</p>}</section>
      {api.role==='admin'&&<section className="mt-6 border-t pt-5"><h3 className="font-semibold">بيانات تاريخية غير منسوبة</h3><p className="mt-1 text-xs text-muted-foreground">خارج ترتيب الموظفين وإجمالياتهم؛ المعلّق بلا موظف مسؤول يظهر هنا دون نسبته كإنجاز.</p><div className="mt-3 flex flex-wrap gap-2">{metrics.map(k=><Button key={k} variant="outline" onClick={()=>setDetails({title:`غير منسوب — ${metricLabels[k]}`,rows:unknown.filter(e=>e.metric===k)})}>{metricLabels[k]}: {unknown.filter(e=>e.metric===k).length}</Button>)}</div></section>}
    </ReadState>}
    <Dialog open={Boolean(details)} onOpenChange={o=>!o&&setDetails(null)}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="pe-8 text-start">{details?.title}</DialogTitle></DialogHeader>{details?.rows.length?<ul className="divide-y">{details.rows.map((e,i)=><li key={`${e.entity_id}-${e.at}-${i}`} className="py-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{e.label}</span><span className="text-xs text-muted-foreground">{formatDate(e.at)}</span></div><p className="break-all text-xs text-muted-foreground">{statusName(e.status)} · {e.entity_id}</p>{e.entity==='requests'?<Link to={paths.transaction} params={{id:e.entity_id}} className="text-primary">فتح الطلب</Link>:e.entity==='bookings'?<Link to={paths.booking} params={{id:e.entity_id}} className="text-primary">فتح الحجز</Link>:e.entity==='customers'?<Link to={paths.customer} params={{id:e.entity_id}} className="text-primary">فتح العميل</Link>:null}</li>)}</ul>:<p className="text-sm text-muted-foreground">لا توجد سجلات مطابقة.</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(profile)} onOpenChange={o=>!o&&setProfile(null)}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="pe-8 text-start">{data?.members.find(m=>m.user_id===profile)?.full_name??'ملف الموظف'}</DialogTitle></DialogHeader><p className="break-all text-xs text-muted-foreground">{profile}</p><h3 className="font-semibold">سجل العمليات — {timeline.length}</h3><ol className="divide-y">{timeline.map(a=><li key={a.id} className="py-3 text-sm"><p>{activityActionLabels[a.action]??a.action} · {activityEntityLabels[a.entity]??a.entity}</p><p className="break-all text-xs text-muted-foreground">{formatDate(a.created_at)} · {a.entity_id??'—'}</p></li>)}</ol>{!timeline.length&&<p className="text-sm text-muted-foreground">لا توجد عمليات في الفترة.</p>}</DialogContent></Dialog>
  </>;
}