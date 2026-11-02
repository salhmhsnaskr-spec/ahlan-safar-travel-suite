import type { DocumentLinks } from './api';
import { workOwner, type WorkRecord } from './work-permissions';

type Parent = WorkRecord & { customer_id?: string | null; request_id?: string | null };
export type OwnerLookups = { customers: readonly Parent[]; requests: readonly Parent[]; bookings: readonly Parent[] };

/** Resolve all links in the same office; a missing/contradictory link fails closed. */
export function documentWorkOwner(officeId: string, links: DocumentLinks & { uploaded_by?: string | null }, rows: OwnerLookups): string | null {
  if (!links.customer_id && !links.request_id && !links.booking_id) return links.uploaded_by ?? null;
  const find = (list: readonly Parent[], id: string | null | undefined) => id ? list.find(r => r.id === id && r.office_id === officeId) : undefined;
  const booking = find(rows.bookings, links.booking_id);
  const request = find(rows.requests, links.request_id ?? booking?.request_id);
  const customerId = links.customer_id ?? request?.customer_id ?? booking?.customer_id;
  const customer = find(rows.customers, customerId);
  if ((links.booking_id && !booking) || ((links.request_id ?? booking?.request_id) && !request) || !customer) throw new Error('علاقات الوثيقة غير واضحة.');
  if ((request?.customer_id && request.customer_id !== customer.id) || (booking?.customer_id && booking.customer_id !== customer.id) || (links.request_id && booking?.request_id && links.request_id !== booking.request_id)) throw new Error('علاقات الوثيقة متعارضة.');
  return (booking && workOwner(booking)) ?? (request && workOwner(request)) ?? workOwner(customer);
}