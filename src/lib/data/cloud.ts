import { supabase } from "@/integrations/supabase/client";
import type { DataApi } from "./api";
import type { AppRole, Member } from "@/lib/domain";
import type { PerformanceData } from "@/lib/performance";
import { assertLocalDeletionEnvironment } from "./permanent-deletion";
import { permanentDelete } from "./permanent-deletion.functions";
import { cloudDelete, retryCloudDeletion, type DeletionOutcome } from './cloud-deletion.functions';
import type { OfficeProfile, PendingDeletion } from './api';
import type { WorkPermission } from './work-permissions';
import { authorizeWorkApi } from './authorized-api';

/** Database rows are already gone; report files that Storage has not yet confirmed as removed. */
function incomplete(r: DeletionOutcome) {
  if (!r.completed) throw new Error(`حُذفت السجلات، لكن ${r.remaining} ملف لم يتأكد حذفه من التخزين بعد. أعد المحاولة من «عمليات حذف معلقة».`);
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Cloud data source. Every query is additionally protected by row-level security on the server. */
export function createCloudApi(officeId: string, officeName: string, role: AppRole, userId: string): DataApi {
  const api: DataApi = {
    mode: "cloud",
    key: "cloud-" + officeId,
    role,
    userId,
    officeName,
    officeId,
    listWorkPermissions: async () =>
      must(await supabase.from("work_record_permissions").select("office_id,entity,record_id,operation,grantee_id,granted_by,owner_id").eq("office_id", officeId)) as WorkPermission[],
    setWorkPermission: async input =>
      void must(await supabase.rpc("set_work_permission", { _office: officeId, _entity: input.entity, _record: input.recordId, _grantee: input.granteeId, _operation: input.operation, _allow: input.allow })),
    getOffice: async () => {
      const o = must(await supabase.from("offices").select("id,name,phone,whatsapp,email,address,city,country,location_url,website,description,logo_path,is_partner").eq("id", officeId).single());
      let logo_url: string | null = null;
      if (o.logo_path) logo_url = (await supabase.storage.from("office-logos").createSignedUrl(o.logo_path, 3600)).data?.signedUrl ?? null;
      return { ...o, logo_url } as OfficeProfile;
    },
    saveOffice: async (input) => {
      if (!input.name.trim()) throw new Error("اسم المكتب مطلوب.");
      void must(await supabase.from("offices").update({ ...input, name: input.name.trim() }).eq("id", officeId).select("id").single());
    },
    uploadLogo: async (file) => {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("الشعار يجب أن يكون صورة PNG أو JPG أو WEBP أو SVG.");
      if (file.size > 2 * 1024 * 1024) throw new Error("حجم الشعار يتجاوز 2MB.");
      const prev = must(await supabase.from("offices").select("logo_path").eq("id", officeId).single()).logo_path;
      const ext = (file.name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? ".png").toLowerCase();
      const path = `${officeId}/logo-${crypto.randomUUID()}${ext}`;
      const up = await supabase.storage.from("office-logos").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error("تعذّر رفع الشعار: " + up.error.message);
      const res = await supabase.from("offices").update({ logo_path: path }).eq("id", officeId);
      if (res.error) { await supabase.storage.from("office-logos").remove([path]); throw new Error(res.error.message); }
      if (prev) await supabase.storage.from("office-logos").remove([prev]);
    },
    removeLogo: async () => {
      const prev = must(await supabase.from("offices").select("logo_path").eq("id", officeId).single()).logo_path;
      void must(await supabase.from("offices").update({ logo_path: null }).eq("id", officeId).select("id").single());
      if (prev) await supabase.storage.from("office-logos").remove([prev]);
    },
    listPendingDeletions: async () =>
      must(await supabase.from("deletion_jobs").select("id,kind,status,remaining,attempts,last_error,created_at").eq("office_id", officeId).neq("status", "completed").order("created_at", { ascending: false })) as PendingDeletion[],
    retryDeletion: async (id) => { incomplete(await retryCloudDeletion({ data: { jobId: id } })); },
    listCustomers: async () =>
      must(await supabase.from("customers").select("*").eq("office_id", officeId).order("created_at", { ascending: false })),
    saveCustomer: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("customers").update(rest).eq("id", id).select().single())
        : must(await supabase.from("customers").insert({ ...rest, office_id: officeId }).select().single()),
    deleteCustomer: async (id) => { incomplete(await cloudDelete({ data: { kind: "customer", targetId: id } })); },
    deleteOffice: async () => {
      assertLocalDeletionEnvironment(import.meta.env['VITE_LOCAL_PERMANENT_DELETION'], import.meta.env['VITE_SUPABASE_URL']);
      await permanentDelete({ data: { officeId, targetId: officeId, kind: "office" } });
    },
    listRequests: async () =>
      must(await supabase.from("requests").select("*").eq("office_id", officeId).order("number", { ascending: false })),
    saveRequest: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("requests").update(rest).eq("id", id).select().single())
        : must(await supabase.from("requests").insert({ ...rest, office_id: officeId }).select().single()),
    deleteRequest: async (id) => void must(await supabase.from("requests").delete().eq("id", id)),
    listPartners: async () =>
      must(await supabase.from("partner_offices").select("*").eq("office_id", officeId).order("created_at", { ascending: false })),
    savePartner: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("partner_offices").update(rest).eq("id", id).select().single())
        : must(await supabase.from("partner_offices").insert({ ...rest, office_id: officeId }).select().single()),
    deletePartner: async (id) => void must(await supabase.from("partner_offices").delete().eq("id", id)),
    listServices: async () =>
      must(await supabase.from("services").select("*").or(`office_id.is.null,office_id.eq.${officeId}`).order("sort_order")),
    addService: async (input) =>
      must(
        await supabase
          .from("services")
          .insert({ office_id: officeId, code: "custom", name: input.name, description: input.description ?? null, icon: "sparkles" })
          .select()
          .single(),
      ),
    toggleService: async (id, active) => void must(await supabase.from("services").update({ is_active: active }).eq("id", id)),
    updateService: async ({ id, name, description }) =>
      void must(await supabase.from("services").update({ name, description: description ?? null }).eq("id", id)),
    listBookings: async () =>
      must(await supabase.from("bookings").select("*").eq("office_id", officeId).order("number", { ascending: false })),
    saveBooking: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("bookings").update(rest).eq("id", id).select().single())
        : must(await supabase.from("bookings").insert({ ...rest, office_id: officeId }).select().single()),
    deleteBooking: async (id) => void must(await supabase.from("bookings").delete().eq("id", id)),
    listTasks: async () =>
      must(await supabase.from("tasks").select("*").eq("office_id", officeId).order("due_at", { ascending: true, nullsFirst: false })),
    saveTask: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("tasks").update(rest).eq("id", id).select().single())
        : must(await supabase.from("tasks").insert({ title: "", ...rest, office_id: officeId }).select().single()),
    deleteTask: async (id) => void must(await supabase.from("tasks").delete().eq("id", id)),
    listDocuments: async () =>
      must(await supabase.from("documents").select("*").eq("office_id", officeId).order("created_at", { ascending: false })),
    uploadDocument: async (file, links) => {
      const MAX = 20 * 1024 * 1024;
      if (file.size > MAX) throw new Error(`حجم الملف ${(file.size / 1024 / 1024).toFixed(1)}MB يتجاوز الحد المسموح (20MB). اضغط الملف أو قسّمه ثم أعد المحاولة.`);
      if (file.size === 0) throw new Error("الملف فارغ، اختر ملفًا آخر.");
      const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
      const base = file.name.slice(0, file.name.length - ext.length).replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(-60);
      const path = `${officeId}/${crypto.randomUUID()}-${base || "file"}${ext}`;
      // Read the file into memory first: phone browsers (gallery/cloud files) can hand over a File that
      // fails mid-stream, which surfaces only as "Failed to fetch". A plain in-memory Blob uploads reliably.
      let body: Blob;
      try {
        body = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
      } catch {
        throw new Error("تعذّرت قراءة الملف من جهازك. إن كان من معرض الصور أو التخزين السحابي، احفظه على الجهاز أولًا ثم أعد المحاولة.");
      }
      const opts = { contentType: body.type, upsert: false };
      // Persist cleanup metadata BEFORE Storage: a failed request never loses the
      // path of a possibly uploaded object (including an ambiguous network error).
      must(await supabase.from("documents").insert({
        office_id: officeId, storage_path: path, file_name: file.name, size_bytes: file.size, mime_type: file.type || null,
        uploaded_by: userId, customer_id: links.customer_id ?? null, booking_id: links.booking_id ?? null, request_id: links.request_id ?? null,
      }));
      let up = await supabase.storage.from("documents").upload(path, body, opts);
      if (up.error && /failed to fetch|network|load failed/i.test(up.error.message)) {
        await new Promise((r) => setTimeout(r, 1200));
        up = await supabase.storage.from("documents").upload(path, body, opts);
      }
      if (up.error) {
        // Retain the row for explicit cleanup; do not compensate by discarding
        // the only durable reference when the upload outcome is uncertain.
        const retained = " احتُفظ بسجل الوثيقة للتحقق والتنظيف؛ لا يُعد الرفع ناجحًا.";
        const m = up.error.message.toLowerCase();
        if (m.includes("maximum allowed size") || m.includes("too large")) throw new Error("حجم الملف يتجاوز الحد المسموح (20MB)." + retained);
        if (m.includes("row-level security") || m.includes("unauthorized")) throw new Error("ليست لديك صلاحية رفع ملفات لهذا المكتب." + retained);
        if (m.includes("jwt") || m.includes("exp claim")) throw new Error("انتهت جلستك، سجّل الدخول من جديد ثم أعد المحاولة." + retained);
        if (/failed to fetch|network|load failed/.test(m)) throw new Error("انقطع الاتصال أثناء رفع الملف." + retained);
        throw new Error(up.error.message + retained);
      }
    },
    documentUrl: async (doc) => {
      const r = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
      if (r.error) throw new Error(r.error.message);
      return r.data.signedUrl;
    },
    deleteDocument: async (doc) => { incomplete(await cloudDelete({ data: { kind: "document", targetId: doc.id } })); },
    listActivity: async (actorId) => {
      let query = supabase.from("activity_log").select("*").eq("office_id", officeId);
      if (actorId) query = query.eq("actor_id", actorId);
      return must(await query.order("created_at", { ascending: false }).limit(1000));
    },
    listTeamActivity: async () => must(await supabase.rpc("team_last_activity", { _office: officeId })),
    performance: async () => must(await supabase.rpc("team_performance", { _office: officeId })) as unknown as PerformanceData,
    listTrips: async () =>
      must(await supabase.from("umrah_trips").select("*").eq("office_id", officeId).order("created_at", { ascending: false })),
    saveTrip: async ({ id, ...rest }) =>
      id
        ? must(await supabase.from("umrah_trips").update(rest).eq("id", id).select().single())
        : must(await supabase.from("umrah_trips").insert({ ...rest, office_id: officeId }).select().single()),
    deleteTrip: async (id) => void must(await supabase.from("umrah_trips").delete().eq("id", id)),
    listParticipants: async () =>
      must(await supabase.from("umrah_participants").select("*").eq("office_id", officeId).order("created_at")),
    saveParticipant: async ({ id, ...rest }) => {
      const res = id
        ? await supabase.from("umrah_participants").update(rest).eq("id", id).select().single()
        : await supabase.from("umrah_participants").insert({ ...rest, office_id: officeId }).select().single();
      if (res.error?.code === "23505") throw new Error("هذا المعتمر مضاف مسبقًا إلى هذه الرحلة.");
      if (res.error?.code === "23514") throw new Error("تواريخ الدخول والمغادرة غير متسقة.");
      return must(res);
    },
    deleteParticipant: async (id) => void must(await supabase.from("umrah_participants").delete().eq("id", id)),
    listMembers: async () => {
      const rows = must(await supabase.from("office_members").select("user_id, role, status, created_at").eq("office_id", officeId));
      const ids = rows.map((r) => r.user_id);
      const profiles = ids.length ? must(await supabase.from("profiles").select("id, full_name, email").in("id", ids)) : [];
      const map = new Map(profiles.map((p) => [p.id, p]));
      return rows.map<Member>((r) => ({
        user_id: r.user_id,
        role: r.role,
        status: r.status as NonNullable<Member["status"]>,
        joined_at: r.created_at,
        full_name: map.get(r.user_id)?.full_name ?? null,
        email: map.get(r.user_id)?.email ?? null,
      }));
    },
  };
  return authorizeWorkApi(api, officeId);
}
