import type { AppRole } from "@/lib/domain";

/** Also enforced by RLS; this check prevents a destructive Storage call first. */
export function assertDocumentDeletion(role: AppRole, userId: string, uploadedBy: string | null) {
  if (role !== "admin" && uploadedBy !== userId) throw new Error("ليست لديك صلاحية حذف هذه الوثيقة");
}

export function assertCustomerHasNoDependents(groups: readonly (readonly unknown[])[]) {
  if (groups.some((rows) => rows.length > 0)) {
    throw new Error("لا يمكن حذف العميل لوجود طلبات أو حجوزات أو مهام أو وثائق أو مشاركات عمرة مرتبطة به. عالج السجلات المرتبطة أولًا.");
  }
}