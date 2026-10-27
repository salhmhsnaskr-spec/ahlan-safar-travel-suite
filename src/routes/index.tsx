import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, ClipboardList, Handshake, ShieldCheck, Smartphone, Users, BarChart3, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero.jpg";
import shareImage from "@/assets/ahlan-safar-share.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أهلًا سفر — نظام إدارة مكاتب السفر والسياحة" },
      { name: "description", content: "أدر عملاءك وطلباتك وحجوزاتك ومكاتبك الشريكة من مكان واحد. جرّب أهلًا سفر الآن بدون تسجيل." },
      { property: "og:title", content: "أهلًا سفر — نظام إدارة مكاتب السفر والسياحة" },
      { property: "og:description", content: "أدر عملاءك وطلباتك وحجوزاتك ومكاتبك الشريكة من مكان واحد." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "أهلًا سفر — Ahlan Safar" },
      { property: "og:locale", content: "ar_YE" },
      { property: "og:image", content: `https://ahlan-safar-travel-suite.lovable.app${shareImage.url}` },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "أهلًا سفر — جناح طائرة فوق الساحل عند الشروق" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "أهلًا سفر — نظام إدارة مكاتب السفر والسياحة" },
      { name: "twitter:description", content: "أدر عملاءك وطلباتك وحجوزاتك ومكاتبك الشريكة من مكان واحد." },
      { name: "twitter:image", content: `https://ahlan-safar-travel-suite.lovable.app${shareImage.url}` },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Users, title: "إدارة العملاء", body: "ملف كامل لكل عميل: الطلبات، الحجوزات، الملاحظات وسجل النشاط." },
  { icon: ClipboardList, title: "تتبّع الطلبات", body: "سبع حالات واضحة بشارات ملوّنة، تعرف وضع كل طلب من النظرة الأولى." },
  { icon: Handshake, title: "المكاتب الشريكة", body: "اعرف كم عميلًا وطلبًا حوّله لك كل مكتب شريك وما حالته." },
  { icon: Building2, title: "متعدد المكاتب", body: "بيانات كل مكتب معزولة تمامًا عن غيره بحماية على مستوى قاعدة البيانات." },
  { icon: ShieldCheck, title: "صلاحيات واضحة", body: "مدير يملك كل الصلاحيات، وموظفون يديرون العمليات اليومية." },
  { icon: BarChart3, title: "تقارير فورية", body: "مؤشرات الأداء حسب الحالة والخدمة والمصدر والمكتب المُحيل." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth" search={{ mode: "login" }}>تسجيل الدخول</Link></Button>
          <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/auth" search={{ mode: "signup" }}>إنشاء حساب</Link></Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-2 md:px-8 md:pt-12">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/25 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="size-3.5" /> نظام سحابي لمكاتب السفر والسياحة
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.2] tracking-tight md:text-5xl lg:text-6xl">
            كل رحلات عملائك،<br /><span className="text-primary">في لوحة واحدة.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            أهلًا سفر يجمع العملاء والطلبات والحجوزات والمكاتب الشريكة في نظام واحد سريع، يعمل على الهاتف والكمبيوتر والجهاز اللوحي.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 bg-accent px-7 text-base text-accent-foreground hover:bg-accent/90">
              <Link to="/demo">جرّب الآن <ArrowLeft /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
              <Link to="/auth" search={{ mode: "signup" }}>إنشاء حساب مجاني</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">التجربة مباشرة — بدون بريد إلكتروني أو كلمة مرور.</p>
        </div>
        <div className="relative">
          <img src={hero} alt="جناح طائرة فوق ساحل صحراوي عند الشروق" width={1600} height={1104} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl" />
          <div className="absolute -bottom-6 start-4 w-64 rounded-2xl border bg-card p-4 shadow-xl md:start-[-2rem]">
            <p className="text-xs text-muted-foreground">طلب REQ-0042</p>
            <p className="mt-1 font-semibold">تذاكر الرياض ← إسطنبول</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success/25">
              <span className="size-1.5 rounded-full bg-current" /> مؤكد
            </span>
          </div>
        </div>
      </section>

      <section className="bg-ink py-16 text-ink-foreground md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="max-w-xl text-3xl font-bold md:text-4xl">كل ما يحتاجه مكتبك لإدارة يومه.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-ink-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-ink p-6">
                <f.icon className="size-6 text-accent" />
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-foreground/70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-8 rounded-3xl border bg-card p-8 md:grid-cols-[1fr_auto] md:p-12">
          <div>
            <Smartphone className="size-7 text-primary" />
            <h2 className="mt-4 text-2xl font-bold md:text-3xl">جاهز لترى النظام بعينك؟</h2>
            <p className="mt-2 text-muted-foreground">أضف عملاء، أنشئ طلبات، غيّر حالاتها وأنشئ حجوزات — في نسخة تجريبية كاملة ومعزولة.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg"><Link to="/demo">جرّب الآن</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth" search={{ mode: "login" }}>تسجيل الدخول</Link></Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row md:px-8">
          <Logo />
          <p>© {new Date().getFullYear()} أهلًا سفر. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
