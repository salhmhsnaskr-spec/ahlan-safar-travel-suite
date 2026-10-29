/** Umrah stay rule: inclusive count — entry day and exit day both count (1st → 10th = 10 days). */
export type Stay =
  | { kind: "final"; days: number }
  | { kind: "so_far"; days: number }
  | { kind: "none"; reason: "no_entry" | "invalid" | "future_entry" };

const DAY = 86_400_000;
const parse = (s: string | null | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Number.isNaN(t) ? null : t;
};

export function stayDuration(entry: string | null | undefined, exit: string | null | undefined, today: string): Stay {
  const e = parse(entry);
  if (e === null) return { kind: "none", reason: exit ? "invalid" : "no_entry" };
  if (exit) {
    const x = parse(exit);
    if (x === null || x < e) return { kind: "none", reason: "invalid" };
    return { kind: "final", days: Math.round((x - e) / DAY) + 1 };
  }
  const t = parse(today)!;
  if (t < e) return { kind: "none", reason: "future_entry" };
  return { kind: "so_far", days: Math.round((t - e) / DAY) + 1 };
}

export function stayLabel(s: Stay) {
  if (s.kind === "final") return `${s.days} ${s.days >= 3 && s.days <= 10 ? "أيام" : "يوم"}`;
  if (s.kind === "so_far") return `الأيام حتى الآن: ${s.days}`;
  return s.reason === "invalid" ? "تواريخ غير صحيحة" : s.reason === "future_entry" ? "لم يصل بعد" : "—";
}

/** Returns an Arabic error message when actual/planned dates are inconsistent, else null. */
export function validateParticipantDates(p: { planned_entry?: string | null; planned_exit?: string | null; actual_entry?: string | null; actual_exit?: string | null }) {
  if (p.actual_exit && !p.actual_entry) return "لا يمكن تسجيل المغادرة الفعلية قبل تسجيل الدخول الفعلي.";
  if (p.actual_entry && p.actual_exit && p.actual_exit < p.actual_entry) return "تاريخ المغادرة الفعلي قبل تاريخ الدخول.";
  if (p.planned_entry && p.planned_exit && p.planned_exit < p.planned_entry) return "تاريخ المغادرة المخطط قبل تاريخ الدخول المخطط.";
  return null;
}

export const tripStatusLabels = { planned: "مخططة", preparing: "قيد التجهيز", in_progress: "جارية", completed: "مكتملة", cancelled: "ملغاة" } as const;
export const pilgrimStatusLabels = { registered: "مسجّل", preparing: "مستعد للسفر", arrived: "وصل إلى السعودية", departed: "غادر", cancelled: "ملغى" } as const;
