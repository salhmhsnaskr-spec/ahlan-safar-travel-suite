import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRouter } from '@tanstack/react-router';
import { deletionStatus } from './permanent-deletion.functions';
import { EmptyState, Loading } from '@/components/kit';
import { Button } from '@/components/ui/button';
export function DeletionQuarantine({officeId,children}:{officeId:string;children:ReactNode}){
 const status=useServerFn(deletionStatus);const qc=useQueryClient();const router=useRouter();const wasPending=useRef(false);
 const q=useQuery({queryKey:['deletion-status',officeId],queryFn:()=>status({data:{officeId}}),refetchInterval:2000});
 useEffect(()=>{
  if(q.data?.pending){wasPending.current=true;qc.removeQueries({queryKey:['cloud-'+officeId]});}
  else if((q.isSuccess || q.isError) && wasPending.current){wasPending.current=false;router.invalidate();}
 },[q.data,q.isSuccess,q.isError,officeId,qc,router]);
 if(q.isError)return <EmptyState title="تعذّر التحقق من حالة الحذف" body="بيانات المكتب محجوبة حتى التحقق." action={<Button onClick={()=>q.refetch()}>إعادة المحاولة</Button>}/>;
 if(q.isLoading)return <Loading/>;
 if(q.data?.pending)return <EmptyState title="الحذف قيد التنفيذ" body="بيانات المكتب وملفاته محجوبة حتى اكتمال العملية. ستُعاد محاولة الخطوات المتعثرة تلقائيًا."/>;
 return children;
}