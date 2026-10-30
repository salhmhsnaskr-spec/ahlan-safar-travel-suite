import type { AppRole } from "@/lib/domain";

export type TeamActivity = { user_id: string; last_activity_at: string | null };

export function canManageOffice(role: AppRole) { return role === "admin"; }

export function activityIsRecent(at: string | null | undefined, now = Date.now()) {
  if (!at) return false;
  const time = Date.parse(at);
  return Number.isFinite(time) && time <= now && time >= now - 30 * 86400000;
}