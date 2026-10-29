import type { DataApi } from "./api";
import type { ActivityRow, DocumentRow, Booking, Customer, Member, Partner, Service, Task, TravelRequest, UmrahParticipant, UmrahTrip } from "@/lib/domain";

/**
 * Demo data lives only in this browser's localStorage under DEMO_KEY.
 * It never touches the cloud database, so it is fully isolated from real offices.
 * exportDemoData() returns a portable snapshot that a future "import my demo data" flow can upload.
 */
const DEMO_KEY = "ahlan-safar-demo-v1";
const DEMO_OFFICE = "demo-office";

type DemoDB = {
  seq: number;
  customers: Customer[];
  requests: TravelRequest[];
  partners: Partner[];
  services: Service[];
  members: Member[];
  bookings: Booking[];
  tasks: Task[];
  bseq: number;
  documents?: DocumentRow[];
  trips?: UmrahTrip[];
  participants?: UmrahParticipant[];
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86400000).toISOString();
const day = (daysFromNow: number) => iso(daysFromNow).slice(0, 10);

function seed(): DemoDB {
  const members: Member[] = [
    { user_id: "demo-admin", role: "admin", full_name: "أنت (المدير)", email: "demo@ahlansafar.app" },
    { user_id: "demo-emp-1", role: "employee", full_name: "سارة الحربي", email: "sara@demo.app" },
    { user_id: "demo-emp-2", role: "employee", full_name: "خالد المطيري", email: "khaled@demo.app" },
  ];
  const svc = (code: string, name: string, icon: string, i: number): Service => ({
    id: "svc-" + code, office_id: null, code, name, icon, description: null, is_active: true, sort_order: i, created_at: iso(-60),
  });
  const services = [
    svc("flight", "تذاكر الطيران", "plane", 1),
    svc("hotel", "الفنادق", "hotel", 2),
    svc("visa", "التأشيرات", "stamp", 3),
    svc("airport_pickup", "استقبال المطار", "car", 4),
    svc("tour", "الرحلات السياحية", "map", 5),
    svc("medical", "المواعيد الطبية", "stethoscope", 6),
    svc("other", "خدمات سفر أخرى", "briefcase", 7),
    svc("visit_visa", "تأشيرة زيارة", "stamp", 8),
    svc("security_approval", "موافقة أمنية", "shield", 9),
    svc("umrah", "عمرة", "moon", 10),
  ];
  const partner = (name: string, city: string, country: string, contact: string, status: Partner["status"]): Partner => ({
    id: uid(), office_id: DEMO_OFFICE, name, city, country, contact_person: contact, status,
    phone: "+966 55 000 " + Math.floor(1000 + Math.random() * 8999), email: null, notes: null, created_at: iso(-40), updated_at: iso(-40),
  });
  const partners = [
    partner("مكتب الرحلة الذهبية", "جدة", "السعودية", "فهد العتيبي", "active"),
    partner("آفاق للسياحة", "دبي", "الإمارات", "مريم السويدي", "active"),
    partner("النخبة للسفر", "القاهرة", "مصر", "أحمد فؤاد", "inactive"),
  ];
  const cust = (full_name: string, nationality: string, source: Customer["source"], partnerId: string | null, assigned: string, d: number): Customer => ({
    id: uid(), office_id: DEMO_OFFICE, full_name, nationality, source, referring_partner_id: partnerId, assigned_to: assigned,
    phone: "+966 50 " + Math.floor(100 + Math.random() * 899) + " " + Math.floor(1000 + Math.random() * 8999),
    email: null, passport_number: null, notes: null, created_by: "demo-admin", created_at: iso(d), updated_at: iso(d),
  });
  const customers = [
    cust("محمد عبدالله القحطاني", "سعودي", "direct", null, "demo-emp-1", -20),
    cust("نورة سالم الدوسري", "سعودية", "phone", null, "demo-emp-2", -15),
    cust("عمر حسن يوسف", "مصري", "partner", partners[0]!.id, "demo-emp-1", -12),
    cust("ليلى أحمد الكعبي", "إماراتية", "partner", partners[1]!.id, "demo-admin", -8),
    cust("يوسف إبراهيم", "أردني", "online", null, "demo-emp-2", -3),
  ];
  let seq = 0;
  const req = (ci: number, svcCode: string, status: TravelRequest["status"], source: TravelRequest["source"], partnerId: string | null, serviceIn: number | null, priority: TravelRequest["priority"], details: string, d: number, booked = false): TravelRequest => ({
    id: uid(), number: ++seq, office_id: DEMO_OFFICE, customer_id: customers[ci]!.id, service_id: "svc-" + svcCode, details,
    source, referring_partner_id: partnerId, assigned_to: customers[ci]!.assigned_to, service_date: serviceIn === null ? null : day(serviceIn),
    priority, status, notes: null, booking_ref: booked ? "BK-" + (7000 + seq) : null, booked_at: booked ? iso(d + 1) : null,
    service_details: {}, created_by: "demo-admin", created_at: iso(d), updated_at: iso(d + 1),
  });
  const requests = [
    req(0, "flight", "confirmed", "direct", null, 5, "normal", "تذكرتان الرياض ← إسطنبول ذهاب وعودة", -18, true),
    req(0, "hotel", "in_progress", "phone_online", null, 5, "normal", "فندق 4 نجوم في تقسيم لمدة 6 ليالٍ", -17),
    req(1, "visa", "awaiting_customer", "phone_online", null, 14, "high", "تأشيرة شنغن — بانتظار كشف الحساب", -14),
    req(2, "medical", "awaiting_approval", "partner", partners[0]!.id, 2, "urgent", "موعد استشاري قلب في مستشفى خاص", -10),
    req(3, "tour", "completed", "partner", partners[1]!.id, -2, "low", "جولة صحراوية عائلية ليوم كامل", -8, true),
    req(4, "airport_pickup", "new", "direct", null, 1, "normal", "استقبال من مطار الملك خالد — رحلة مسائية", -1),
    req(2, "flight", "cancelled", "direct", null, null, "normal", "تذكرة القاهرة — ألغيت بطلب العميل", -6),
  ];
  const db: DemoDB = { seq, customers, requests, partners, services, members, bookings: undefined as unknown as Booking[], tasks: undefined as unknown as Task[], bseq: 0 };
  upgrade(db);
  const bk = (ci: number, svcCode: string, status: Booking["status"], inDays: number, provider: string, emp: string) => {
    db.bseq += 1;
    const b: Booking = {
      id: uid(), number: db.bseq, office_id: DEMO_OFFICE, customer_id: customers[ci]!.id, request_id: null, service_id: "svc-" + svcCode,
      assigned_employee_id: emp, service_date: day(inDays), status, external_ref: null, provider, notes: null,
      created_by: "demo-admin", created_at: iso(-2), updated_at: iso(-2),
    };
    db.bookings.push(b);
    return b;
  };
  bk(1, "hotel", "awaiting_confirmation", 0, "فندق هيلتون الرياض", "demo-emp-2");
  const pick = bk(4, "airport_pickup", "confirmed", 1, "ليموزين المطار", "demo-emp-1");
  const task = (title: string, task_type: Task["task_type"], assigned: string, dueIn: number, priority: Task["priority"], extra: Partial<Task> = {}): Task => ({
    id: uid(), office_id: DEMO_OFFICE, title, task_type, assigned_to: assigned, customer_id: null, request_id: null, booking_id: null, service_id: null,
    due_at: iso(dueIn), priority, status: "new", notes: null, flight_number: null, airport: null, arrival_at: null,
    created_by: "demo-admin", created_at: iso(-1), updated_at: iso(-1), ...extra,
  });
  db.tasks.push(
    task("استقبال يوسف إبراهيم من المطار", "airport_pickup", "demo-emp-1", 1, "high", { customer_id: customers[4]!.id, booking_id: pick.id, service_id: "svc-airport_pickup", flight_number: "SV1234", airport: "مطار الملك خالد", arrival_at: iso(1) }),
    task("متابعة كشف حساب نورة للتأشيرة", "visa_followup", "demo-emp-2", -1, "high", { customer_id: customers[1]!.id }),
    task("تأكيد حجز الفندق مع هيلتون", "hotel_confirmation", "demo-admin", 0, "medium", { customer_id: customers[1]!.id }),
  );
  return db;
}

function load(): DemoDB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDB;
      if (upgrade(db)) save(db);
      return db;
    }
  } catch {
    /* corrupted demo data: reseed */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

/** Older demo snapshots stored bookings on requests; turn those into real bookings without touching the requests. */
function upgrade(db: DemoDB): boolean {
  let changed = false;
  for (const [code, name, i] of [["visit_visa", "تأشيرة زيارة", 8], ["security_approval", "موافقة أمنية", 9], ["umrah", "عمرة", 10]] as const) {
    if (!db.services.some((s) => s.code === code)) {
      db.services.push({ id: "svc-" + code, office_id: null, code, name, icon: "briefcase", description: null, is_active: true, sort_order: i, created_at: new Date().toISOString() });
      changed = true;
    }
  }
  if (db.bookings && db.tasks) return changed;
  db.bookings = db.bookings ?? [];
  db.tasks = db.tasks ?? [];
  db.bseq = db.bseq ?? 0;
  for (const r of db.requests) {
    if (!r.booking_ref) continue;
    db.bseq += 1;
    db.bookings.push({
      id: uid(), number: db.bseq, office_id: DEMO_OFFICE, customer_id: r.customer_id, request_id: r.id, service_id: r.service_id,
      assigned_employee_id: r.assigned_to, service_date: r.service_date,
      status: r.status === "completed" ? "completed" : r.status === "cancelled" ? "cancelled" : "confirmed",
      external_ref: r.booking_ref, provider: null, notes: null, created_by: "demo-admin", created_at: r.booked_at ?? r.created_at, updated_at: r.booked_at ?? r.created_at,
    });
  }
  return true;
}

function save(db: DemoDB) {
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_KEY, JSON.stringify(db));
}

export function resetDemoData() {
  save(seed());
}

export function exportDemoData() {
  const db = load();
  return { version: 1, exported_at: new Date().toISOString(), customers: db.customers, requests: db.requests, partners: db.partners, services: db.services.filter((s) => s.office_id) };
}

function mutate<T>(fn: (db: DemoDB) => T): Promise<T> {
  const db = load();
  const result = fn(db);
  save(db);
  return Promise.resolve(result);
}

export function createDemoApi(): DataApi {
  return {
    mode: "demo",
    key: "demo",
    role: "admin",
    userId: "demo-admin",
    officeName: "مكتب تجريبي",
    listCustomers: async () => load().customers.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    saveCustomer: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        if (input.id) {
          const i = db.customers.findIndex((c) => c.id === input.id);
          db.customers[i] = { ...db.customers[i], ...input, updated_at: now } as Customer;
          return db.customers[i];
        }
        const c: Customer = {
          phone: null, email: null, passport_number: null, nationality: null, notes: null, source: "direct",
          referring_partner_id: null, assigned_to: "demo-admin", ...input,
          id: uid(), office_id: DEMO_OFFICE, created_by: "demo-admin", created_at: now, updated_at: now,
        } as Customer;
        db.customers.push(c);
        return c;
      }),
    deleteCustomer: (id) =>
      mutate((db) => {
        db.customers = db.customers.filter((c) => c.id !== id);
        db.requests = db.requests.filter((r) => r.customer_id !== id);
        db.bookings = db.bookings.filter((b) => b.customer_id !== id);
        db.tasks.forEach((t) => t.customer_id === id && (t.customer_id = null));
      }),
    listRequests: async () => load().requests.slice().sort((a, b) => b.number - a.number),
    saveRequest: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        if (input.id) {
          const i = db.requests.findIndex((r) => r.id === input.id);
          db.requests[i] = { ...db.requests[i], ...input, updated_at: now } as TravelRequest;
          return db.requests[i];
        }
        db.seq += 1;
        const r: TravelRequest = {
          service_id: null, details: null, source: "direct", referring_partner_id: null, assigned_to: "demo-admin",
          service_date: null, priority: "normal", status: "new", notes: null, booking_ref: null, booked_at: null, service_details: {}, ...input,
          id: uid(), number: db.seq, office_id: DEMO_OFFICE, created_by: "demo-admin", created_at: now, updated_at: now,
        } as TravelRequest;
        db.requests.push(r);
        return r;
      }),
    deleteRequest: (id) =>
      mutate((db) => {
        db.requests = db.requests.filter((r) => r.id !== id);
        db.bookings.forEach((b) => b.request_id === id && (b.request_id = null));
        db.tasks.forEach((t) => t.request_id === id && (t.request_id = null));
      }),
    listPartners: async () => load().partners,
    savePartner: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        if (input.id) {
          const i = db.partners.findIndex((p) => p.id === input.id);
          db.partners[i] = { ...db.partners[i], ...input, updated_at: now } as Partner;
          return db.partners[i];
        }
        const p: Partner = {
          phone: null, email: null, country: null, city: null, contact_person: null, notes: null, status: "active", ...input,
          id: uid(), office_id: DEMO_OFFICE, created_at: now, updated_at: now,
        } as Partner;
        db.partners.push(p);
        return p;
      }),
    deletePartner: (id) =>
      mutate((db) => {
        db.partners = db.partners.filter((p) => p.id !== id);
        db.customers.forEach((c) => c.referring_partner_id === id && (c.referring_partner_id = null));
        db.requests.forEach((r) => r.referring_partner_id === id && (r.referring_partner_id = null));
      }),
    listServices: async () => load().services.slice().sort((a, b) => a.sort_order - b.sort_order),
    addService: (input) =>
      mutate((db) => {
        const s: Service = {
          id: uid(), office_id: DEMO_OFFICE, code: "custom", name: input.name, description: input.description ?? null,
          icon: "sparkles", is_active: true, sort_order: 100, created_at: new Date().toISOString(),
        };
        db.services.push(s);
        return s;
      }),
    toggleService: (id, active) =>
      mutate((db) => {
        const s = db.services.find((x) => x.id === id);
        if (s) s.is_active = active;
      }),
    updateService: ({ id, name, description }) =>
      mutate((db) => {
        const s = db.services.find((x) => x.id === id);
        if (s && s.office_id) Object.assign(s, { name, description: description ?? null });
      }),
    listMembers: async () => load().members,
    listBookings: async () => load().bookings.slice().sort((a, b) => b.number - a.number),
    saveBooking: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        if (input.id) {
          const i = db.bookings.findIndex((b) => b.id === input.id);
          db.bookings[i] = { ...db.bookings[i], ...input, updated_at: now } as Booking;
          return db.bookings[i]!;
        }
        db.bseq += 1;
        const b = {
          request_id: null, service_id: null, assigned_employee_id: null, service_date: null, status: "new", external_ref: null, provider: null, notes: null,
          ...input, id: uid(), number: db.bseq, office_id: DEMO_OFFICE, created_by: "demo-admin", created_at: now, updated_at: now,
        } as Booking;
        db.bookings.push(b);
        return b;
      }),
    deleteBooking: (id) =>
      mutate((db) => {
        db.bookings = db.bookings.filter((b) => b.id !== id);
        db.tasks.forEach((t) => t.booking_id === id && (t.booking_id = null));
      }),
    listTasks: async () => load().tasks.slice().sort((a, b) => (a.due_at ?? "9") < (b.due_at ?? "9") ? -1 : 1),
    saveTask: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        if (input.id) {
          const i = db.tasks.findIndex((t) => t.id === input.id);
          db.tasks[i] = { ...db.tasks[i], ...input, updated_at: now } as Task;
          return db.tasks[i]!;
        }
        const t = {
          title: "", task_type: "other", assigned_to: null, customer_id: null, request_id: null, booking_id: null, service_id: null, due_at: null,
          priority: "medium", status: "new", notes: null, flight_number: null, airport: null, arrival_at: null,
          ...input, id: uid(), office_id: DEMO_OFFICE, created_by: "demo-admin", created_at: now, updated_at: now,
        } as Task;
        db.tasks.push(t);
        return t;
      }),
    listDocuments: async () => (load().documents ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    uploadDocument: async (file, links) => {
      if (file.size > 1024 * 1024) throw new Error("في الوضع التجريبي الحد الأقصى للملف 1MB");
      const data_url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      await mutate((db) => {
        db.documents = db.documents ?? [];
        db.documents.push({
          id: uid(), office_id: DEMO_OFFICE, storage_path: "demo/" + uid(), file_name: file.name, size_bytes: file.size, mime_type: file.type || null,
          uploaded_by: "demo-admin", customer_id: links.customer_id ?? null, booking_id: links.booking_id ?? null, request_id: links.request_id ?? null,
          created_at: new Date().toISOString(), data_url,
        });
      });
    },
    documentUrl: async (doc) => doc.data_url ?? "",
    deleteDocument: (doc) => mutate((db) => void (db.documents = (db.documents ?? []).filter((d) => d.id !== doc.id))),
    listActivity: async () => {
      const db = load();
      const row = (entity: string, id: string, action: string, summary: string, at: string): ActivityRow =>
        ({ id: id + action + at, office_id: DEMO_OFFICE, actor_id: "demo-admin", entity, entity_id: id, action, summary, created_at: at });
      const out: ActivityRow[] = [
        ...db.customers.map((c) => row("customers", c.id, "created", c.full_name, c.created_at)),
        ...db.requests.map((r) => row("requests", r.id, "created", "REQ-" + String(r.number).padStart(4, "0"), r.created_at)),
        ...db.bookings.flatMap((b) => [row("bookings", b.id, "created", "BK-" + String(b.number).padStart(4, "0"), b.created_at),
          ...(b.updated_at !== b.created_at ? [row("bookings", b.id, "status", "BK-" + String(b.number).padStart(4, "0") + "|" + b.status, b.updated_at)] : [])]),
        ...db.tasks.map((t) => row("tasks", t.id, t.updated_at !== t.created_at ? "status" : "created", t.title + (t.updated_at !== t.created_at ? "|" + t.status : ""), t.updated_at)),
        ...(db.documents ?? []).map((d) => row("documents", d.id, "created", d.file_name, d.created_at)),
      ];
      return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 200);
    },
    deleteTask: (id) => mutate((db) => void (db.tasks = db.tasks.filter((t) => t.id !== id))),
    listTrips: async () => (load().trips ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    saveTrip: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        db.trips = db.trips ?? [];
        if (input.id) {
          const i = db.trips.findIndex((t) => t.id === input.id);
          db.trips[i] = { ...db.trips[i], ...input, updated_at: now } as UmrahTrip;
          return db.trips[i];
        }
        const t: UmrahTrip = { planned_start: null, planned_end: null, status: "planned", notes: null, ...input, id: uid(), office_id: DEMO_OFFICE, created_by: "demo-admin", created_at: now, updated_at: now } as UmrahTrip;
        db.trips.push(t);
        return t;
      }),
    deleteTrip: (id) => mutate((db) => {
      db.trips = (db.trips ?? []).filter((t) => t.id !== id);
      db.participants = (db.participants ?? []).filter((p) => p.trip_id !== id);
    }),
    listParticipants: async () => load().participants ?? [],
    saveParticipant: (input) =>
      mutate((db) => {
        const now = new Date().toISOString();
        db.participants = db.participants ?? [];
        if (db.participants.some((p) => p.trip_id === input.trip_id && p.customer_id === input.customer_id && p.id !== input.id))
          throw new Error("هذا المعتمر مضاف مسبقًا إلى هذه الرحلة.");
        if (input.id) {
          const i = db.participants.findIndex((p) => p.id === input.id);
          db.participants[i] = { ...db.participants[i], ...input, updated_at: now } as UmrahParticipant;
          return db.participants[i];
        }
        const p: UmrahParticipant = { request_id: null, status: "registered", planned_entry: null, planned_exit: null, actual_entry: null, actual_exit: null, notes: null, ...input, id: uid(), office_id: DEMO_OFFICE, created_at: now, updated_at: now } as UmrahParticipant;
        db.participants.push(p);
        return p;
      }),
    deleteParticipant: (id) => mutate((db) => void (db.participants = (db.participants ?? []).filter((p) => p.id !== id))),
  };
}
