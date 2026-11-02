import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useData, useMembers } from '@/lib/data/context';
import { canManageWork, workOwner, type WorkEntity, type WorkRecord } from '@/lib/data/work-permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/kit';

export function useWorkAccess() {
  const api = useData();
  const grants = useQuery({ queryKey: [api.key, 'work-permissions'], queryFn: api.listWorkPermissions });
  return (entity: WorkEntity, row: WorkRecord, operation: 'edit' | 'delete') => canManageWork(
    { userId: api.userId, officeId: api.office.id, role: api.role, active: true }, entity, row, operation, grants.data ?? [],
  );
}

export function WorkPermissionControl({ entity, record, label }: { entity: WorkEntity; record: WorkRecord; label: string }) {
  const api = useData();
  const members = useMembers();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [grantee, setGrantee] = useState('');
  const [operation, setOperation] = useState<'edit' | 'delete'>('edit');
  const grant = useMutation({ mutationFn: (allow: boolean) => api.setWorkPermission({ entity, recordId: record.id, granteeId: grantee, operation, allow }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.key] }); toast.success('تم تحديث الإذن'); }, onError: (error: Error) => toast.error(error.message) });
  if (entity === 'umrah_trips' || record.office_id !== api.office.id || (api.role !== 'admin' && workOwner(record) !== api.userId)) return null;
  return <>
    <Button size="icon" variant="ghost" aria-label={`أذونات ${label}`} title={`أذونات ${label}`} onClick={() => { setOpen(true); setGrantee(''); }}><KeyRound /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>أذونات {label}</DialogTitle></DialogHeader>
      <NativeSelect aria-label="الموظف المفوض" value={grantee} onChange={e => setGrantee(e.target.value)}><option value="">اختر الموظف</option>{(members.data ?? []).filter(m => (m.status ?? 'active') === 'active' && m.user_id !== api.userId).map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect>
      <NativeSelect aria-label="نوع الإذن" value={operation} onChange={e => setOperation(e.target.value === 'delete' ? 'delete' : 'edit')}><option value="edit">تعديل</option><option value="delete">حذف</option></NativeSelect>
      <div className="flex gap-2"><Button disabled={!grantee || grant.isPending} onClick={() => grant.mutate(true)}>منح الإذن</Button><Button variant="outline" disabled={!grantee || grant.isPending} onClick={() => grant.mutate(false)}>إلغاء الإذن</Button></div>
    </DialogContent></Dialog>
  </>;
}