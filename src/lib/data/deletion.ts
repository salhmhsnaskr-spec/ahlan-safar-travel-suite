import type { AppRole } from "@/lib/domain";

/** Also enforced by RLS; this check prevents a destructive Storage call first. */
export function assertDocumentDeletion(role: AppRole, userId: string, uploadedBy: string | null) {
  if (role !== "admin" && uploadedBy !== userId) throw new Error("ليست لديك صلاحية حذف هذه الوثيقة");
}
