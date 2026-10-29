import type { Tables } from "@/integrations/supabase/types";

export type Customer = Tables<"customers">;
export type TravelRequest = Tables<"requests">;
export type Partner = Tables<"partner_offices">;
export type Service = Tables<"services">;
export type AppRole = "admin" | "employee";
export type MemberStatus = "active" | "suspended" | "removed";
export type Member = { user_id: string; role: AppRole; full_name: string | null; email: string | null; status?: MemberStatus; joined_at?: string };

export type CustomerSource = Customer["source"];
export type RequestSource = TravelRequest["source"];
export type RequestStatus = TravelRequest["status"];
export type RequestPriority = TravelRequest["priority"];

export const customerSourceLabels: Record<CustomerSource, string> = {
  direct: "مباشر",
  online: "تواصل إلكتروني",
  phone: "هاتف",
  partner: "مكتب شريك",
  other: "أخرى",
};

export const requestSourceLabels: Record<RequestSource, string> = {
  direct: "مباشر",
  phone_online: "هاتف / تواصل إلكتروني",
  partner: "مكتب شريك",
  other: "أخرى",
};

export const statusLabels: Record<RequestStatus, string> = {
  new: "جديد",
  in_progress: "قيد المعالجة",
  awaiting_customer: "بانتظار العميل",
  awaiting_approval: "بانتظار الموافقة",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export const statusOrder: RequestStatus[] = [
  "new",
  "in_progress",
  "awaiting_customer",
  "awaiting_approval",
  "confirmed",
  "completed",
  "cancelled",
];

export const statusTone: Record<RequestStatus, string> = {
  new: "bg-info/12 text-info ring-info/25",
  in_progress: "bg-primary/12 text-primary ring-primary/25",
  awaiting_customer: "bg-warning/15 text-warning ring-warning/30",
  awaiting_approval: "bg-violet/12 text-violet ring-violet/25",
  confirmed: "bg-success/12 text-success ring-success/25",
  completed: "bg-ink/10 text-ink ring-ink/20",
  cancelled: "bg-danger/12 text-danger ring-danger/25",
};

export const priorityLabels: Record<RequestPriority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "مرتفعة",
  urgent: "عاجلة",
};

export const priorityTone: Record<RequestPriority, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-warning",
  urgent: "text-danger",
};

export const isOpenStatus = (s: RequestStatus) => s !== "completed" && s !== "cancelled";

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(d),
    );
  } catch {
    return d;
  }
}

export function requestCode(n: number) {
  return `REQ-${String(n).padStart(4, "0")}`;
}

export type AppNotification = {
  id: string;
  kind: "new" | "upcoming" | "waiting" | "approval";
  title: string;
  body: string;
  date: string;
  requestId: string;
};

export function deriveNotifications(requests: TravelRequest[], customers: Customer[]): AppNotification[] {
  const names = new Map(customers.map((c) => [c.id, c.full_name]));
  const now = Date.now();
  const out: AppNotification[] = [];
  for (const r of requests) {
    const who = names.get(r.customer_id) ?? "عميل";
    const code = requestCode(r.number);
    if (r.status === "new")
      out.push({ id: r.id + "n", kind: "new", title: `طلب جديد ${code}`, body: `طلب جديد من ${who} بانتظار المعالجة`, date: r.created_at, requestId: r.id });
    if (r.status === "awaiting_customer")
      out.push({ id: r.id + "w", kind: "waiting", title: `متابعة ${code}`, body: `الطلب بانتظار رد ${who}`, date: r.updated_at, requestId: r.id });
    if (r.status === "awaiting_approval")
      out.push({ id: r.id + "a", kind: "approval", title: `موافقة مطلوبة ${code}`, body: `طلب ${who} بانتظار الموافقة`, date: r.updated_at, requestId: r.id });
    if (r.service_date && isOpenStatus(r.status)) {
      const diff = (new Date(r.service_date).getTime() - now) / 86400000;
      if (diff >= -1 && diff <= 3)
        out.push({ id: r.id + "u", kind: "upcoming", title: `موعد خدمة قريب ${code}`, body: `خدمة ${who} بتاريخ ${formatDate(r.service_date)}`, date: r.service_date, requestId: r.id });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const statusBar: Record<RequestStatus, string> = {
  new: "bg-info",
  in_progress: "bg-primary",
  awaiting_customer: "bg-warning",
  awaiting_approval: "bg-violet",
  confirmed: "bg-success",
  completed: "bg-ink",
  cancelled: "bg-danger",
};

export type Booking = Tables<"bookings">;
export type Task = Tables<"tasks">;
export type BookingStatus = Booking["status"];
export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
export type TaskType = Task["task_type"];

export const bookingStatusLabels: Record<BookingStatus, string> = {
  new: "جديد", in_progress: "قيد المعالجة", awaiting_confirmation: "بانتظار التأكيد", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغي",
};
export const bookingStatusOrder: BookingStatus[] = ["new", "in_progress", "awaiting_confirmation", "confirmed", "completed", "cancelled"];
export const bookingStatusTone: Record<BookingStatus, string> = {
  new: statusTone.new, in_progress: statusTone.in_progress, awaiting_confirmation: statusTone.awaiting_approval,
  confirmed: statusTone.confirmed, completed: statusTone.completed, cancelled: statusTone.cancelled,
};
export const taskStatusLabels: Record<TaskStatus, string> = { new: "جديدة", in_progress: "قيد التنفيذ", done: "مكتملة", cancelled: "ملغاة" };
export const taskStatusOrder: TaskStatus[] = ["new", "in_progress", "done", "cancelled"];
export const taskStatusTone: Record<TaskStatus, string> = {
  new: statusTone.new, in_progress: statusTone.in_progress, done: statusTone.confirmed, cancelled: statusTone.cancelled,
};
export const taskPriorityLabels: Record<TaskPriority, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية" };
export const taskPriorityTone: Record<TaskPriority, string> = { low: "text-muted-foreground", medium: "text-foreground", high: "text-danger" };
export const taskTypeLabels: Record<TaskType, string> = {
  customer_followup: "متابعة عميل", booking_confirmation: "تأكيد حجز", ticket_booking: "حجز تذكرة", hotel_confirmation: "تأكيد فندق",
  visa_followup: "متابعة تأشيرة", airport_pickup: "استقبال مطار", medical_followup: "متابعة موعد طبي", other: "مهمة أخرى",
};
export const isOpenBooking = (s: BookingStatus) => s !== "completed" && s !== "cancelled";
export const isOpenTask = (s: TaskStatus) => s === "new" || s === "in_progress";
export const bookingCode = (n: number) => `BK-${String(n).padStart(4, "0")}`;
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  } catch { return d; }
}

export type DocumentRow = Tables<"documents"> & { data_url?: string };
export type ActivityRow = Tables<"activity_log">;
export const activityEntityLabels: Record<string, string> = { customers: "عميل", requests: "طلب", bookings: "حجز", tasks: "مهمة", documents: "وثيقة" };
export const activityActionLabels: Record<string, string> = { created: "إنشاء", updated: "تعديل", deleted: "حذف", status: "تغيير حالة" };
export function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type UmrahTrip = Tables<"umrah_trips">;
export type UmrahParticipant = Tables<"umrah_participants">;
