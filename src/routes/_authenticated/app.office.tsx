import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useData } from '@/lib/data/context';
import { EmptyState, PageHeader } from '@/components/kit';
import { OfficeDeleteControl } from '@/components/office-delete';
export const Route=createFileRoute('/_authenticated/app/office')({
 head:()=>({meta:[{title:'إدارة المكتب — أهلًا سفر'},{name:'description',content:'إدارة حذف المكتب المخول في أهلًا سفر.'},{property:'og:title',content:'إدارة المكتب — أهلًا سفر'},{property:'og:description',content:'إدارة المكتب للمخولين فقط.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 component:OfficeManagement,
});
function OfficeManagement(){
 const api=useData();const navigate=useNavigate();
 if(api.role!=='admin')return <EmptyState title="غير مصرح" body="إدارة المكتب متاحة للمدير المخول فقط." />;
 return <><PageHeader title="إدارة المكتب" subtitle={api.officeName}/><OfficeDeleteControl name={api.officeName} remove={api.deleteOffice} onComplete={()=>navigate({to:'/app',replace:true})}/></>;
}