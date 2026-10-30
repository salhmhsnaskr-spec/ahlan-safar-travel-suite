import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useData, useMembers, useTeamActivity } from "@/lib/data/context";
import { Field, NativeSelect, PageHeader, ReadState } from "@/components/kit";
import { ConfirmDelete } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Member } from "@/lib/domain";
import { formatDateTime } from "@/lib/domain";
import { activityIsRecent } from "@/lib/staff";
import { ActivityPage } from "@/components/pages/activity";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({ meta: [{ title: "إدارة الفريق — أهلًا سفر" }, { name: "description", content: "دعوة موظفي المكتب وإدارة أدوارهم وعضوياتهم." }, { property: "og:title", content: "إدارة الفريق — أهلًا سفر" }, { property: "og:description", content: "إدارة الفريق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Team,
});

type Invite = { id: string; email: string; role: "admin" | "employee"; status: string; expires_at: string; send_status: string; created_at: string };

const memberStatus: Record<string, { label: string; cls: string }> = {
  active: { label: "نشطة", cls: "bg-success/15 text-success" },
  suspended: { label: "موقوفة", cls: "bg-warning/15 text-warning" },
  removed: { label: "مُزال (موظف سابق)", cls: "bg-muted text-muted-foreground" },
};
const sendLabel: Record<string, string> = { sent: "أُرسلت بالبريد", failed: "فشل الإرسال", not_configured: "البريد غير مُعدّ بعد — شارك الرابط يدويًا", pending: "لم تُرسل" };
const inviteErrors: Record<string, string> = {
  invalid_email: "البريد غير صالح.", already_member: "هذا البريد عضو في المكتب بالفعل.",
  already_invited: "توجد دعوة معلقة لهذا البريد. أعد إرسالها من القائمة.", too_soon: "انتظر دقيقة قبل إعادة الإرسال.", not_pending: "الدعوة لم تعد معلقة.",
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" }) : "—");

function inviteState(i: Invite) {
  if (i.status === "pending" && new Date(i.expires_at) < new Date()) return "منتهية";
  return ({ pending: "معلقة", accepted: "مقبولة", revoked: "ملغاة" } as Record<string, string>)[i.status] ?? i.status;
}

function Team() {
  const { office } = Route.useRouteContext();
  const api = useData();
  const memberQuery = useMembers();
  const members = memberQuery.data ?? [];
  const teamActivity = useTeamActivity();
  const lastActivity = new Map((teamActivity.data ?? []).map((a) => [a.user_id, a.last_activity_at]));
  const [selected, setSelected] = useState<Member | null>(null);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [confirm, setConfirm] = useState<{ m: Member; action: "suspended" | "removed" } | null>(null);
  const invites = useQuery({
    queryKey: [api.key, "invitations"],
    queryFn: async () => {
      const r = await supabase.from("office_invitations").select("id, email, role, status, expires_at, send_status, created_at").eq("office_id", office.id).order("created_at", { ascending: false });
      if (r.error) throw new Error(r.error.message);
      return r.data as Invite[];
    },
    enabled: api.role === "admin",
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: [api.key, "members"] }); qc.invalidateQueries({ queryKey: [api.key, "invitations"] }); };
  if (api.role !== "admin") return <p className="text-muted-foreground">هذه الصفحة للمدير فقط.</p>;

  // Email delivery is not configured yet: record that honestly and expose the link for manual sharing.
  async function deliver(id: string, token: string, to: string) {
    await supabase.rpc("mark_invitation_sent", { _id: id, _status: "not_configured" });
    setLink({ email: to, url: `${window.location.origin}/invite/${token}` });
  }
  async function setStatus(m: Member, status: "active" | "suspended" | "removed") {
    const { error } = await supabase.rpc("set_member_status", { _office: office.id, _user: m.user_id, _status: status });
    if (error) toast.error(error.message.includes("آخر مدير") ? error.message : "تعذّر تنفيذ العملية: " + error.message);
    else toast.success(status === "active" ? "أُعيد تفعيل العضوية" : status === "suspended" ? "أُوقفت العضوية" : "أُزيل العضو من المكتب");
    refresh();
  }

  const visible = members.filter((m) => m.status !== "removed");
  const former = members.filter((m) => m.status === "removed");
  return (
    <>
      <PageHeader title="إدارة الفريق" subtitle="ادعُ موظفيك بالبريد؛ تُنشأ العضوية فقط بعد قبول الموظف للدعوة." />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end" onSubmit={async (e): Promise<void> => {
        e.preventDefault();
        const { data, error } = await supabase.rpc("create_invitation", { _office: office.id, _email: email, _role: role });
        if (error) { toast.error(error.message); return; }
        const r = data as { id?: string; token?: string; error?: string };
        if (r.error || !r.id || !r.token) { toast.error(inviteErrors[r.error ?? ""] ?? "تعذّر إنشاء الدعوة"); return; }
        await deliver(r.id, r.token, email.trim().toLowerCase());
        toast.message("أُنشئت الدعوة", { description: "إرسال البريد غير مفعّل بعد، فلم تُرسل رسالة. انسخ الرابط وشاركه مع الموظف." });
        setEmail(""); refresh();
      }}>
        <Field label="بريد الموظف"><Input required type="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="الدور"><NativeSelect value={role} onChange={(e) => setRole(e.target.value as "admin" | "employee")}><option value="employee">موظف</option><option value="admin">مدير</option></NativeSelect></Field>
        <Button type="submit">إرسال دعوة</Button>
      </form>

      {link && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium">رابط دعوة <span dir="ltr">{link.email}</span> (صالح 72 ساعة، يظهر مرة واحدة فقط)</p>
          <div className="mt-2 flex gap-2"><Input readOnly dir="ltr" value={link.url} className="text-xs" /><Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link.url); toast.success("نُسخ الرابط"); }}><Copy className="size-4" /></Button></div>
        </div>
      )}

      <h2 className="mb-2 font-semibold">الأعضاء</h2>
      <ReadState queries={[memberQuery, teamActivity]} title="تعذّر تحميل الفريق وآخر نشاط">
      <ul className="mb-6 divide-y rounded-xl border bg-card">
        {visible.map((m) => {
          const st = memberStatus[m.status ?? "active"] ?? memberStatus.active;
          const self = m.user_id === api.userId;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{m.full_name || "—"} {self && <span className="text-xs text-muted-foreground">(أنت)</span>} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span></p>
                <p className="text-xs text-muted-foreground"><span dir="ltr">{m.email}</span> · انضم {fmt(m.joined_at)}</p>
                <p className="text-xs text-muted-foreground">آخر نشاط: {formatDateTime(lastActivity.get(m.user_id))} · {activityIsRecent(lastActivity.get(m.user_id)) ? "نشط خلال آخر 30 يومًا" : "لا نشاط مسجل خلال آخر 30 يومًا"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(m)}>ملف الموظف</Button>
                <NativeSelect aria-label="الدور" className="h-8 w-28 text-xs" value={m.role} onChange={async (e) => {
                  const { error } = await supabase.from("office_members").update({ role: e.target.value as "admin" | "employee" }).eq("office_id", office.id).eq("user_id", m.user_id);
                  if (error) toast.error(error.message); refresh();
                }}><option value="employee">موظف</option><option value="admin">مدير</option></NativeSelect>
                {m.status === "suspended"
                  ? <Button size="sm" variant="outline" onClick={() => setStatus(m, "active")}>إعادة التفعيل</Button>
                  : <Button size="sm" variant="outline" onClick={() => setConfirm({ m, action: "suspended" })}>إيقاف</Button>}
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm({ m, action: "removed" })}>إزالة</Button>
              </div>
            </li>
          );
        })}
      </ul>
      </ReadState>

      <h2 className="mb-2 font-semibold">الدعوات</h2>
      {invites.isError ? <p className="mb-6 text-sm text-danger">تعذّر تحميل الدعوات. <button className="underline" onClick={() => invites.refetch()}>إعادة المحاولة</button></p> :
       invites.isLoading ? <p className="mb-6 text-sm text-muted-foreground">جارٍ التحميل…</p> :
       !invites.data?.length ? <p className="mb-6 text-sm text-muted-foreground">لا توجد دعوات بعد.</p> : (
        <ul className="mb-6 divide-y rounded-xl border bg-card">
          {invites.data.map((i) => {
            const state = inviteState(i);
            const open = state === "معلقة" || state === "منتهية";
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p dir="ltr" className="text-end font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">{i.role === "admin" ? "مدير" : "موظف"} · {state} · {i.status === "pending" ? sendLabel[i.send_status] : ""} · {state === "معلقة" ? `تنتهي ${fmt(i.expires_at)}` : `أُنشئت ${fmt(i.created_at)}`}</p>
                </div>
                {open && (
                  <div className="flex gap-2">
                    {state === "معلقة" && <Button size="sm" variant="outline" onClick={async () => {
                      const { data, error } = await supabase.rpc("resend_invitation", { _id: i.id });
                      const r = data as { id?: string; token?: string; error?: string } | null;
                      if (error || !r?.token) { toast.error(inviteErrors[r?.error ?? ""] ?? error?.message ?? "تعذّر"); return; }
                      await deliver(i.id, r.token, i.email); toast.success("أُصدر رابط جديد وأُبطل الرابط السابق"); refresh();
                    }}>إعادة الإرسال</Button>}
                    <Button size="sm" variant="ghost" className="text-danger" onClick={async () => {
                      const { error } = await supabase.rpc("revoke_invitation", { _id: i.id });
                      if (error) toast.error(error.message); else toast.success("أُلغيت الدعوة"); refresh();
                    }}>إلغاء</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {former.length > 0 && (<>
        <h2 className="mb-2 font-semibold text-muted-foreground">موظفون سابقون</h2>
        <p className="mb-2 text-xs text-muted-foreground">تبقى أعمالهم السابقة منسوبة إليهم. لإعادتهم أرسل دعوة جديدة.</p>
        <ul className="divide-y rounded-xl border bg-card">{former.map((m) => <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span>{m.full_name || "—"} · <span dir="ltr">{m.email}</span> · آخر نشاط: {formatDateTime(lastActivity.get(m.user_id))}</span><Button size="sm" variant="outline" onClick={() => setSelected(m)}>ملف الموظف</Button></li>)}</ul>
      </>)}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent dir="rtl" className="max-h-[85dvh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle className="text-start">{selected?.full_name || selected?.email || "ملف الموظف"}</DialogTitle><DialogDescription className="text-start">{selected?.role === "admin" ? "مدير" : "موظف"} · {memberStatus[selected?.status ?? "active"]?.label} · انضم {fmt(selected?.joined_at)} · آخر نشاط: {formatDateTime(selected ? lastActivity.get(selected.user_id) : null)}</DialogDescription></DialogHeader>
          {selected && <ActivityPage key={selected.user_id} actorId={selected.user_id} embedded />}
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "removed" ? "إزالة العضو من المكتب؟" : "إيقاف العضوية مؤقتًا؟"}
        body={confirm?.action === "removed" ? "تنتهي عضويته ويفقد الوصول فورًا. لا يُحذف حسابه الشخصي ولا أعماله السابقة." : "يُمنع من الوصول فورًا مع الاحتفاظ بعضويته، ويمكنك إعادة تفعيله لاحقًا."}
        confirmLabel={confirm?.action === "removed" ? "إزالة" : "إيقاف"}
        onConfirm={() => { if (confirm) setStatus(confirm.m, confirm.action); setConfirm(null); }} />
    </>
  );
}
