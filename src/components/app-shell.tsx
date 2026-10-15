import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Bell, BarChart3, Briefcase, CalendarCheck, ClipboardList, Handshake, LayoutDashboard, Menu, Users, UserCog, X, LogOut, FlaskConical, ListTodo, History, FolderOpen,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { useData, usePaths } from "@/lib/data/context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof Bell; exact?: boolean };

export function AppShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const api = useData();
  const p = usePaths();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items: NavItem[] = [
    { to: p.home, label: "لوحة التحكم", icon: LayoutDashboard, exact: true },
    { to: p.customers, label: "العملاء", icon: Users },
    { to: p.requests, label: "الطلبات", icon: ClipboardList },
    { to: p.bookings, label: "الحجوزات", icon: CalendarCheck },
    { to: p.tasks, label: "المهام", icon: ListTodo },
    { to: p.documents, label: "المستندات", icon: FolderOpen },
    { to: p.services, label: "الخدمات", icon: Briefcase },
    { to: p.partners, label: "المكاتب الشريكة", icon: Handshake },
    { to: p.notifications, label: "الإشعارات", icon: Bell },
    { to: p.reports, label: "التقارير", icon: BarChart3 },
    { to: p.activity, label: "سجل النشاط", icon: History },
  ];
  if (api.mode === "cloud" && api.role === "admin") items.push({ to: "/app/team", label: "الفريق والصلاحيات", icon: UserCog });

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            to={it.to as any}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4.5" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="px-1"><Logo light /></Link>
      <div className="rounded-lg bg-sidebar-accent px-3 py-2.5">
        <p className="text-[11px] text-sidebar-foreground/60">{api.mode === "demo" ? "الوضع التجريبي" : api.role === "admin" ? "مدير المكتب" : "موظف"}</p>
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{api.officeName}</p>
      </div>
      <div className="flex-1 overflow-y-auto">{nav}</div>
      {footer}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {api.mode === "demo" && (
        <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-xs font-medium text-accent-foreground">
          <FlaskConical className="size-3.5" />
          أنت في الوضع التجريبي — البيانات محفوظة في متصفحك فقط ومعزولة تمامًا.
          <Link to="/auth" search={{ mode: "signup" }} className="underline underline-offset-2">أنشئ حسابًا</Link>
        </div>
      )}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 bg-sidebar lg:block" style={api.mode === "demo" ? { top: 32 } : undefined}>{side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-sidebar shadow-xl">
            <button className="absolute end-3 top-4 text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="size-5" /></button>
            {side}
          </aside>
        </div>
      )}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="القائمة"><Menu /></Button>
          <Logo />
          <Link to={p.notifications} className="p-2"><Bell className="size-5" /></Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}

export function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <LogOut className="size-4" /> تسجيل الخروج
    </button>
  );
}
