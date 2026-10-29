import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/kit";

type Mode = "login" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode | undefined; redirect?: string | undefined } => {
    const m = s["mode"];
    const r = s["redirect"];
    // Only same-origin invitation paths are accepted as a post-login destination.
    const redirect = typeof r === "string" && /^\/invite\/[a-f0-9]{64}$/.test(r) ? r : undefined;
    return { mode: m === "signup" || m === "forgot" || m === "login" ? m : undefined, redirect };
  },
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — أهلًا سفر" },
      { name: "description", content: "سجّل الدخول أو أنشئ حسابًا في أهلًا سفر لإدارة مكتب السفر الخاص بك." },
      { property: "og:title", content: "تسجيل الدخول — أهلًا سفر" },
      { property: "og:description", content: "سجّل الدخول أو أنشئ حسابًا في أهلًا سفر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});


function AuthPage() {
  const { mode: initial, redirect } = Route.useSearch();
  const dest = redirect ?? "/app";
  const [mode, setMode] = useState<Mode>(initial ?? "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);
  const navigate = useNavigate();

  useEffect(() => setMode(initial ?? "login"), [initial]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && navigate({ to: dest, replace: true }));
  }, [navigate, dest]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: dest, replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + dest, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: dest, replace: true });
        else setSent("confirm");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        setSent("reset");
      }
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(
        msg.includes("Invalid login") ? "البريد أو كلمة المرور غير صحيحة" :
        msg.includes("Email not confirmed") ? "يرجى تأكيد بريدك الإلكتروني أولًا" :
        msg.includes("already registered") ? "هذا البريد مسجّل مسبقًا" : msg,
      );
    } finally {
      setBusy(false);
    }
  }


  const titles: Record<Mode, string> = { login: "مرحبًا بعودتك", signup: redirect ? "أنشئ حسابك الشخصي" : "أنشئ حساب مكتبك", forgot: "استعادة كلمة المرور" };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center"><Logo /></Link>
        <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-10 text-primary" />
              <h1 className="mt-4 text-xl font-bold">تحقق من بريدك الإلكتروني</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {sent === "confirm" ? `أرسلنا رابط تأكيد إلى ${email}. افتحه لتفعيل حسابك.` : `أرسلنا رابط استعادة كلمة المرور إلى ${email}.`}
              </p>
              <Button variant="outline" className="mt-6" onClick={() => { setSent(null); setMode("login"); }}>العودة لتسجيل الدخول</Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{titles[mode]}</h1>
              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "signup" && <Field label="الاسم الكامل"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>}
                <Field label="البريد الإلكتروني"><Input required type="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                {mode !== "forgot" && (
                  <Field label="كلمة المرور"><Input required type="password" minLength={6} dir="ltr" className="text-end" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
                )}
                {mode === "login" && (
                  <button type="button" className="text-xs text-primary" onClick={() => setMode("forgot")}>نسيت كلمة المرور؟</button>
                )}
                <Button type="submit" className="h-11 w-full" disabled={busy}>
                  {busy ? "لحظة…" : mode === "login" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء الحساب" : "إرسال رابط الاستعادة"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>ليس لديك حساب؟ <button className="font-medium text-primary" onClick={() => setMode("signup")}>أنشئ حسابًا</button></>
                ) : (
                  <>لديك حساب؟ <button className="font-medium text-primary" onClick={() => setMode("login")}>سجّل الدخول</button></>
                )}
              </p>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          تريد الاستكشاف أولًا؟ <Link to="/demo" className="font-medium text-primary">جرّب النسخة التجريبية</Link>
        </p>
      </div>
    </div>
  );
}
