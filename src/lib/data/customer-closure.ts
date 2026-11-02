type Linked = { id: string; office_id: string; customer_id?: string | null; request_id?: string | null; booking_id?: string | null };
export type ClosureInput = { requests: Linked[]; bookings: Linked[]; tasks: Linked[]; documents: (Linked & { storage_path: string })[]; participants: Linked[] };

/** Reject ambiguous relationships before removing either files or metadata. */
export function customerClosure(officeId: string, customerId: string, input: ClosureInput) {
  const requests = input.requests.filter(r => r.customer_id === customerId);
  const requestIds = new Set(requests.map(r => r.id));
  const bookings = input.bookings.filter(r => r.customer_id === customerId || Boolean(r.request_id && requestIds.has(r.request_id)));
  const bookingIds = new Set(bookings.map(r => r.id));
  const linked = (r: Linked) => r.customer_id === customerId || Boolean(r.request_id && requestIds.has(r.request_id)) || Boolean(r.booking_id && bookingIds.has(r.booking_id));
  const selected = [...requests, ...bookings, ...input.tasks.filter(linked), ...input.documents.filter(linked), ...input.participants.filter(linked)];
  for (const r of selected) {
    if (r.office_id !== officeId || (r.customer_id && r.customer_id !== customerId) || (r.request_id && !requestIds.has(r.request_id)) || (r.booking_id && !bookingIds.has(r.booking_id))) throw new Error('علاقات العميل غير واضحة؛ لم يبدأ الحذف.');
  }
  const documents = input.documents.filter(linked);
  const documentIds = new Set(documents.map(r => r.id));
  if (documents.some(d => input.documents.some(other => other.storage_path === d.storage_path && !documentIds.has(other.id)))) throw new Error('ملف مشترك خارج نطاق العميل؛ لم يبدأ الحذف.');
  return { requests: requestIds, bookings: bookingIds, tasks: new Set(input.tasks.filter(linked).map(r => r.id)), documents: documentIds, participants: new Set(input.participants.filter(linked).map(r => r.id)) };
}