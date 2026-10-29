import type { ActivityRow, AppRole, Booking, DocumentRow, Customer, Member, Partner, Service, Task, TravelRequest, UmrahParticipant, UmrahTrip } from "@/lib/domain";

export type CustomerInput = Partial<Omit<Customer, "id" | "office_id" | "created_at" | "updated_at" | "created_by">> & { id?: string | undefined;
  full_name: string;
};
export type RequestInput = Partial<
  Omit<TravelRequest, "id" | "office_id" | "created_at" | "updated_at" | "created_by" | "number">
> & { id?: string | undefined; customer_id: string };
export type PartnerInput = Partial<Omit<Partner, "id" | "office_id" | "created_at" | "updated_at">> & { id?: string | undefined; name: string };
export type ServiceInput = { id?: string | undefined; name: string; description?: string | null };
export type BookingInput = Partial<Omit<Booking, "id" | "office_id" | "created_at" | "updated_at" | "created_by" | "number">> & { id?: string | undefined; customer_id: string };
export type TaskInput = Partial<Omit<Task, "id" | "office_id" | "created_at" | "updated_at" | "created_by">> & { id?: string | undefined; title?: string };

export type TripInput = Partial<Omit<UmrahTrip, "id" | "office_id" | "created_at" | "updated_at" | "created_by">> & { id?: string | undefined; name: string };
export type ParticipantInput = Partial<Omit<UmrahParticipant, "id" | "office_id" | "created_at" | "updated_at">> & { id?: string | undefined; trip_id: string; customer_id: string };

/**
 * Shared contract for the demo (browser-only, isolated) and cloud (per-office, RLS) data sources.
 * Every page talks to this interface, so the demo and the real app render identical screens.
 */
export type DocumentLinks = { customer_id?: string | null; booking_id?: string | null; request_id?: string | null };

export interface DataApi {
  mode: "demo" | "cloud";
  key: string;
  role: AppRole;
  userId: string;
  officeName: string;
  listCustomers(): Promise<Customer[]>;
  saveCustomer(input: CustomerInput): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  listRequests(): Promise<TravelRequest[]>;
  saveRequest(input: RequestInput): Promise<TravelRequest>;
  deleteRequest(id: string): Promise<void>;
  listPartners(): Promise<Partner[]>;
  savePartner(input: PartnerInput): Promise<Partner>;
  deletePartner(id: string): Promise<void>;
  listServices(): Promise<Service[]>;
  addService(input: ServiceInput): Promise<Service>;
  toggleService(id: string, active: boolean): Promise<void>;
  updateService(input: ServiceInput & { id: string }): Promise<void>;
  listMembers(): Promise<Member[]>;
  listBookings(): Promise<Booking[]>;
  saveBooking(input: BookingInput): Promise<Booking>;
  deleteBooking(id: string): Promise<void>;
  listTasks(): Promise<Task[]>;
  saveTask(input: TaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  listDocuments(): Promise<DocumentRow[]>;
  uploadDocument(file: File, links: DocumentLinks): Promise<void>;
  documentUrl(doc: DocumentRow): Promise<string>;
  deleteDocument(doc: DocumentRow): Promise<void>;
  listActivity(): Promise<ActivityRow[]>;
  listTrips(): Promise<UmrahTrip[]>;
  saveTrip(input: TripInput): Promise<UmrahTrip>;
  deleteTrip(id: string): Promise<void>;
  listParticipants(): Promise<UmrahParticipant[]>;
  saveParticipant(input: ParticipantInput): Promise<UmrahParticipant>;
  deleteParticipant(id: string): Promise<void>;
}
