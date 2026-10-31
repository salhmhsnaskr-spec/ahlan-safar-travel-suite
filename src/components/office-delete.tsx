import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/confirm';
import { permanentDelete } from '@/lib/data/permanent-deletion.functions';

export function OfficeDeleteControl({ name, remove, onComplete }: { name: string; remove: () => Promise<unknown>; onComplete?: () => void }) {
 const [open,setOpen]=useState(false);
 const queryClient=useQueryClient();
 const mutation=useMutation({mutationFn:remove,onSuccess:()=>{setOpen(false);toast.success('تم حذف المكتب نهائيًا');queryClient.clear();onComplete?.();},onError:(e:Error)=>{setOpen(false);queryClient.invalidateQueries();toast.error('لم يكتمل حذف المكتب',{description:e.message});}});
 return <><Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={()=>setOpen(true)}><Trash2 /> حذف المكتب نهائيًا</Button>
 <ConfirmDelete open={open} onOpenChange={setOpen} title={`حذف ${name} نهائيًا؟`} body="ستُحذف بيانات المكتب وعملاؤه ومعاملاته وملفاته وعضوياته نهائيًا. لن تُحذف الحسابات المشتركة مع مكاتب أخرى. لا يمكن التراجع." confirmLabel={mutation.isPending?'جارٍ الحذف…':'حذف نهائيًا'} onConfirm={()=>{if(!mutation.isPending)mutation.mutate();}} /></>;
}

export function OwnerOfficeDelete({id,name}:{id:string;name:string}) {
 const remove=useServerFn(permanentDelete);
 return <OfficeDeleteControl name={name} remove={()=>remove({data:{officeId:id,targetId:id,kind:'office'}})} />;
}