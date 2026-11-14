import type { AppRole } from "@/lib/domain";

export type OfficeChoice = { id: string; role: AppRole; name: string };
const key = (userId: string) => `ahlan.office.${userId}`;

/** The remembered office is only a preference; it is honoured only when it is one of the user's active memberships. */
export function pickOffice(offices: OfficeChoice[], userId: string, stored?: string | null): OfficeChoice | undefined {
  const wanted = stored !== undefined ? stored : typeof window === "undefined" ? null : window.localStorage.getItem(key(userId));
  return offices.find((o) => o.id === wanted) ?? offices[0];
}

export function rememberOffice(userId: string, officeId: string) {
  window.localStorage.setItem(key(userId), officeId);
}
