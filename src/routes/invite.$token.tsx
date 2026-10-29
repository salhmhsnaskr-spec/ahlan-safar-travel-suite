import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [
    { title: "دعوة للانضمام إلى مكتب — أهلًا سفر" },
    { name: "description", content: "اقبل دعوة الانضمام إلى فريق مكتب سفر في أهلًا سفر." },
    { property: "og:title", content: "دعوة للانضمام — أهلًا سفر" },
    { property: "og:description", content: "اقبل دعوة الانضمام إلى فريق مكتب سفر." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: InvitePage,
});

type Preview = { state: "pending" | "accepted" | "revoked" | "expired" | "invalid"; office_name?: string; role?: string; email?: string };

const errors: Record<string, string> = {
  invalid: "رابط الدعوة غير صالح.",
  used: "تم استخدام هذه الدعوة مسبقًا.",
  revoked: "أُلغيت هذه الدعوة. اطلب من مدير المكتب دعوة جديدة.",
  expired: "انتهت صلاحية الدعوة (72 ساعة). اطلب من مدير المكتب إعادة إرسالها.",
  email_unconfirmed: "أكّد بريدك الإلكتروني أولًا من رسالة التفعيل، ثم عد إلى هذا الرابط.",
  email_mismatch: "هذه الدعوة لبريد مختلف عن بريد حسابك. سجّل الخروج وادخل بالبريد المدعو.",
  not_signed_in: "سجّل الدخول أولًا.",
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const back = `/invite/${token}`;

  useEffect(() => {
    supabase.rpc("invitation_preview", { _token: token }).then(({ data, error }) => {
      setPreview(error ? { state: "invalid" } : (data as Preview));
    });
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, [token]);

  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);
    if (error) { toast.error("تعذّر قبول الدعوة، أعد المحاولة."); return; }
    const r = data as { ok?: boolean; error?: string };
    if (r.ok || r.error === "already_member") {
      toast.success(r.ok ? "انضممت إلى المكتب" : "أنت عضو في هذا المكتب بالفعل");
      navigate({ to: "/app", replace: true });
      return;
    }
    toast.error(errors[r.error ?? ""] ?? "تعذّر قبول الدعوة.");
    if (r.error && r.error !== "email_mismatch" && r.error !== "email_unconfirmed") setPreview((p) => p && { ...p, state: r.error === "used" ? "accepted" : (r.error as Preview["state"]) });
  }

  const roleLabel = preview?.role === "admin" ? "مدير" : "موظف";
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center"><Logo /></Link>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm md:p-8">
          {!preview || userEmail === undefined ? (
            <p className="text-muted-foreground">جارٍ التحقق من الدعوة…</p>
          ) : preview.state !== "pending" ? (
            <>
              <h1 className="text-xl font-bold">لا يمكن استخدام هذه الدعوة</h1>
              <p className="mt-2 text-sm text-muted-foreground">{errors[preview.state === "accepted" ? "used" : preview.state]}</p>
              <Button asChild variant="outline" className="mt-6"><Link to="/auth">الذهاب لتسجيل الدخول</Link></Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold">دعوة للانضمام إلى «{preview.office_name}»</h1>
              <p className="mt-2 text-sm text-muted-foreground">دُعيت بصفة <b>{roleLabel}</b> على البريد <span dir="ltr">{preview.email}</span>. لن يُنشأ لك مكتب جديد.</p>
              {userEmail ? (
                <div className="mt-6 space-y-3">
                  <p className="text-xs text-muted-foreground">أنت مسجّل الدخول بـ <span dir="ltr">{userEmail}</span></p>
                  <Button className="h-11 w-full" disabled={busy} onClick={accept}>{busy ? "لحظة…" : "قبول الدعوة"}</Button>
                  <Button variant="ghost" className="w-full" onClick={async () => { await supabase.auth.signOut(); setUserEmail(null); }}>الدخول بحساب آخر</Button>
                </div>
              ) : (
                <div className="mt-6 grid gap-2">
                  <Button asChild className="h-11"><Link to="/auth" search={{ mode: "signup", redirect: back }}>إنشاء حساب شخصي</Link></Button>
                  <Button asChild variant="outline" className="h-11"><Link to="/auth" search={{ mode: "login", redirect: back }}>لدي حساب — تسجيل الدخول</Link></Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
