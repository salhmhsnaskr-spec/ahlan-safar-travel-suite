import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Loading, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/domain";

export type PlatformStats = {
  offices: number; active_offices_30d: number; customers: number;
  requests_total: number; requests_cancelled: number; bookings_total: number; bookings_cancelled: number;
  monthly: { month: string; offices: number; customers: number; requests: number; bookings: number }[];
  recent_offices: { id: string; name: string; city: string | null; country: string | null; created_at: string; members: number }[];
};

/** Owner check and stats are both enforced in the database; the UI only reflects the answer. */
export function OwnerDashboard() {
  const q = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const own = await supabase.rpc("is_platform_owner");
      if (own.error) throw new Error(own.error.message);
      if (!own.data) return null;
      const r = await supabase.rpc("platform_stats");
      if (r.error) throw new Error(r.error.message);
      return r.data as unknown as PlatformStats;
    },
  });
  if (q.isError) return <EmptyState title="تعذّر تحميل لوحة المالك" body={q.error.message} action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>} />;
  if (q.isLoading) return <Loading />;
  if (!q.data) return <EmptyState title="غير مصرح" body="هذه الصفحة خاصة بمالك المنصة." action={<Link to="/app" className="text-primary">العودة إلى لوحة المكتب</Link>} />;
  const s = q.data;
  const cards: [string, number, string?][] = [
    ["المكاتب المسجلة", s.offices],
    ["المكاتب النشطة", s.active_offices_30d, "أضافت عميلًا أو طلبًا أو حجزًا خلال آخر 30 يومًا"],
    ["العملاء", s.customers],
    ["طلبات السفر", s.requests_total, `منها ${s.requests_cancelled} ملغاة`],
    ["الحجوزات", s.bookings_total, `منها ${s.bookings_cancelled} ملغاة — مستقلة عن الطلبات`],
  ];
  return (
    <div dir="rtl" className="mx-auto max-w-5xl p-4">
      <PageHeader title="لوحة مالك المنصة" subtitle="أرقام فعلية من قاعدة البيانات لجميع المكاتب" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, n, hint]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{n}</p>
            {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 font-semibold">الإحصاءات الشهرية (آخر 6 أشهر، حسب تاريخ الإنشاء)</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 text-start">الشهر</th><th className="p-2">مكاتب</th><th className="p-2">عملاء</th><th className="p-2">طلبات</th><th className="p-2">حجوزات</th></tr></thead>
          <tbody>{s.monthly.map((m) => (
            <tr key={m.month} className="border-t text-center"><td className="p-2 text-start" dir="ltr">{m.month}</td><td className="p-2">{m.offices}</td><td className="p-2">{m.customers}</td><td className="p-2">{m.requests}</td><td className="p-2">{m.bookings}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h2 className="mb-2 mt-8 font-semibold">أحدث المكاتب المسجلة</h2>
      {s.recent_offices.length === 0 ? <EmptyState title="لا توجد مكاتب" /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {s.recent_offices.map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <span className="font-medium">{o.name}</span>
              <span className="text-muted-foreground">{[o.city, o.country].filter(Boolean).join("، ") || "—"} · {o.members} عضو · {formatDate(o.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
