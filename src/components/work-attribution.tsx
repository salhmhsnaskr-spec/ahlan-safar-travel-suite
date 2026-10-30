import { ReadState } from '@/components/kit';
import { useMembers } from '@/lib/data/context';
import { formatDateTime } from '@/lib/domain';

type AttributedWork = {
  created_by: string | null; created_at: string; updated_by: string | null;
  updated_at: string; completed_by: string | null; completed_at: string | null;
  cancelled_by: string | null; cancelled_at: string | null;
};
export function WorkAttribution({ work }: { work: AttributedWork }) {
  const query = useMembers();
  const members = new Map((query.data ?? []).map((m) => [m.user_id, m]));
  const name = (id: string | null) => {
    if (!id) return 'غير منسوب';
    const person = members.get(id);
    const state = person?.status === 'removed' ? ' · موظف سابق' : person?.status === 'suspended' ? ' · موقوف' : '';
    return (person?.full_name || person?.email || 'هوية محفوظة دون اسم') + state;
  };
  const rows = [
    { label: 'أنشأه', id: work.created_by, at: work.created_at },
    { label: 'آخر من عدّل', id: work.updated_by, at: work.updated_by ? work.updated_at : null },
    { label: 'أكمله', id: work.completed_by, at: work.completed_at },
    { label: 'ألغاه', id: work.cancelled_by, at: work.cancelled_at },
  ];
  return <section className="my-4 border-y py-4">
    <h2 className="mb-3 text-sm font-semibold">سجل المسؤولية</h2>
    <ReadState queries={[query]} title="تعذّر تحميل هوية الموظفين">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => <div key={row.label} className="min-w-0 text-sm">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="mt-1 break-words">{row.at || row.id ? name(row.id) : '—'}{row.at && <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(row.at)}</span>}</dd>
        </div>)}
      </dl>
    </ReadState>
  </section>;
}