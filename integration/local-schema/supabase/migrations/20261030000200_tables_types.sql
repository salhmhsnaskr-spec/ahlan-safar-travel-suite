-- LOCAL REBUILD ONLY. Captured via read-only catalogs 2026-10-30. No application rows.
SET search_path = public, extensions, pg_catalog;

CREATE TYPE public."app_role" AS ENUM ('admin', 'employee');
CREATE TYPE public."booking_status" AS ENUM ('new', 'in_progress', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public."customer_source" AS ENUM ('direct', 'online', 'phone', 'partner', 'other');
CREATE TYPE public."partner_status" AS ENUM ('active', 'inactive');
CREATE TYPE public."request_priority" AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE public."request_source" AS ENUM ('direct', 'phone_online', 'partner', 'other');
CREATE TYPE public."request_status" AS ENUM ('new', 'in_progress', 'awaiting_customer', 'awaiting_approval', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public."task_priority" AS ENUM ('low', 'medium', 'high');
CREATE TYPE public."task_status" AS ENUM ('new', 'in_progress', 'done', 'cancelled');
CREATE TYPE public."task_type" AS ENUM ('customer_followup', 'booking_confirmation', 'ticket_booking', 'hotel_confirmation', 'visa_followup', 'airport_pickup', 'medical_followup', 'other');
CREATE TYPE public."umrah_pilgrim_status" AS ENUM ('registered', 'preparing', 'arrived', 'departed', 'cancelled');
CREATE TYPE public."umrah_trip_status" AS ENUM ('planned', 'preparing', 'in_progress', 'completed', 'cancelled');
CREATE TABLE public."activity_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "actor_id" uuid,
  "entity" text NOT NULL,
  "entity_id" uuid,
  "action" text NOT NULL,
  "summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "old_values" jsonb,
  "new_values" jsonb,
  "result" text,
  "actor_name" text,
  "changed_fields" text[]
);
GRANT MAINTAIN ON TABLE public."activity_log" TO "anon";
GRANT REFERENCES ON TABLE public."activity_log" TO "anon";
GRANT SELECT ON TABLE public."activity_log" TO "anon";
GRANT TRIGGER ON TABLE public."activity_log" TO "anon";
GRANT MAINTAIN ON TABLE public."activity_log" TO "authenticated";
GRANT REFERENCES ON TABLE public."activity_log" TO "authenticated";
GRANT SELECT ON TABLE public."activity_log" TO "authenticated";
GRANT TRIGGER ON TABLE public."activity_log" TO "authenticated";
GRANT DELETE ON TABLE public."activity_log" TO "postgres";
GRANT INSERT ON TABLE public."activity_log" TO "postgres";
GRANT MAINTAIN ON TABLE public."activity_log" TO "postgres";
GRANT REFERENCES ON TABLE public."activity_log" TO "postgres";
GRANT SELECT ON TABLE public."activity_log" TO "postgres";
GRANT TRIGGER ON TABLE public."activity_log" TO "postgres";
GRANT TRUNCATE ON TABLE public."activity_log" TO "postgres";
GRANT UPDATE ON TABLE public."activity_log" TO "postgres";
GRANT INSERT ON TABLE public."activity_log" TO "sandbox_exec";
GRANT SELECT ON TABLE public."activity_log" TO "sandbox_exec";
GRANT DELETE ON TABLE public."activity_log" TO "service_role";
GRANT INSERT ON TABLE public."activity_log" TO "service_role";
GRANT MAINTAIN ON TABLE public."activity_log" TO "service_role";
GRANT REFERENCES ON TABLE public."activity_log" TO "service_role";
GRANT SELECT ON TABLE public."activity_log" TO "service_role";
GRANT TRIGGER ON TABLE public."activity_log" TO "service_role";
GRANT TRUNCATE ON TABLE public."activity_log" TO "service_role";
GRANT UPDATE ON TABLE public."activity_log" TO "service_role";
ALTER TABLE public."activity_log" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."bookings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "number" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."bookings_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "office_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "request_id" uuid,
  "service_id" uuid,
  "assigned_employee_id" uuid,
  "service_date" date,
  "status" booking_status DEFAULT 'new'::booking_status NOT NULL,
  "external_ref" text,
  "provider" text,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "completed_by" uuid,
  "completed_at" timestamp with time zone,
  "cancelled_by" uuid,
  "cancelled_at" timestamp with time zone
);
GRANT DELETE ON TABLE public."bookings" TO "anon";
GRANT INSERT ON TABLE public."bookings" TO "anon";
GRANT MAINTAIN ON TABLE public."bookings" TO "anon";
GRANT REFERENCES ON TABLE public."bookings" TO "anon";
GRANT SELECT ON TABLE public."bookings" TO "anon";
GRANT TRIGGER ON TABLE public."bookings" TO "anon";
GRANT TRUNCATE ON TABLE public."bookings" TO "anon";
GRANT UPDATE ON TABLE public."bookings" TO "anon";
GRANT DELETE ON TABLE public."bookings" TO "authenticated";
GRANT INSERT ON TABLE public."bookings" TO "authenticated";
GRANT MAINTAIN ON TABLE public."bookings" TO "authenticated";
GRANT REFERENCES ON TABLE public."bookings" TO "authenticated";
GRANT SELECT ON TABLE public."bookings" TO "authenticated";
GRANT TRIGGER ON TABLE public."bookings" TO "authenticated";
GRANT TRUNCATE ON TABLE public."bookings" TO "authenticated";
GRANT UPDATE ON TABLE public."bookings" TO "authenticated";
GRANT DELETE ON TABLE public."bookings" TO "postgres";
GRANT INSERT ON TABLE public."bookings" TO "postgres";
GRANT MAINTAIN ON TABLE public."bookings" TO "postgres";
GRANT REFERENCES ON TABLE public."bookings" TO "postgres";
GRANT SELECT ON TABLE public."bookings" TO "postgres";
GRANT TRIGGER ON TABLE public."bookings" TO "postgres";
GRANT TRUNCATE ON TABLE public."bookings" TO "postgres";
GRANT UPDATE ON TABLE public."bookings" TO "postgres";
GRANT INSERT ON TABLE public."bookings" TO "sandbox_exec";
GRANT SELECT ON TABLE public."bookings" TO "sandbox_exec";
GRANT DELETE ON TABLE public."bookings" TO "service_role";
GRANT INSERT ON TABLE public."bookings" TO "service_role";
GRANT MAINTAIN ON TABLE public."bookings" TO "service_role";
GRANT REFERENCES ON TABLE public."bookings" TO "service_role";
GRANT SELECT ON TABLE public."bookings" TO "service_role";
GRANT TRIGGER ON TABLE public."bookings" TO "service_role";
GRANT TRUNCATE ON TABLE public."bookings" TO "service_role";
GRANT UPDATE ON TABLE public."bookings" TO "service_role";
ALTER TABLE public."bookings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "phone" text,
  "email" text,
  "passport_number" text,
  "nationality" text,
  "notes" text,
  "source" customer_source DEFAULT 'direct'::customer_source NOT NULL,
  "referring_partner_id" uuid,
  "assigned_to" uuid,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);
GRANT DELETE ON TABLE public."customers" TO "anon";
GRANT INSERT ON TABLE public."customers" TO "anon";
GRANT MAINTAIN ON TABLE public."customers" TO "anon";
GRANT REFERENCES ON TABLE public."customers" TO "anon";
GRANT SELECT ON TABLE public."customers" TO "anon";
GRANT TRIGGER ON TABLE public."customers" TO "anon";
GRANT TRUNCATE ON TABLE public."customers" TO "anon";
GRANT UPDATE ON TABLE public."customers" TO "anon";
GRANT DELETE ON TABLE public."customers" TO "authenticated";
GRANT INSERT ON TABLE public."customers" TO "authenticated";
GRANT MAINTAIN ON TABLE public."customers" TO "authenticated";
GRANT REFERENCES ON TABLE public."customers" TO "authenticated";
GRANT SELECT ON TABLE public."customers" TO "authenticated";
GRANT TRIGGER ON TABLE public."customers" TO "authenticated";
GRANT TRUNCATE ON TABLE public."customers" TO "authenticated";
GRANT UPDATE ON TABLE public."customers" TO "authenticated";
GRANT DELETE ON TABLE public."customers" TO "postgres";
GRANT INSERT ON TABLE public."customers" TO "postgres";
GRANT MAINTAIN ON TABLE public."customers" TO "postgres";
GRANT REFERENCES ON TABLE public."customers" TO "postgres";
GRANT SELECT ON TABLE public."customers" TO "postgres";
GRANT TRIGGER ON TABLE public."customers" TO "postgres";
GRANT TRUNCATE ON TABLE public."customers" TO "postgres";
GRANT UPDATE ON TABLE public."customers" TO "postgres";
GRANT INSERT ON TABLE public."customers" TO "sandbox_exec";
GRANT SELECT ON TABLE public."customers" TO "sandbox_exec";
GRANT DELETE ON TABLE public."customers" TO "service_role";
GRANT INSERT ON TABLE public."customers" TO "service_role";
GRANT MAINTAIN ON TABLE public."customers" TO "service_role";
GRANT REFERENCES ON TABLE public."customers" TO "service_role";
GRANT SELECT ON TABLE public."customers" TO "service_role";
GRANT TRIGGER ON TABLE public."customers" TO "service_role";
GRANT TRUNCATE ON TABLE public."customers" TO "service_role";
GRANT UPDATE ON TABLE public."customers" TO "service_role";
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "customer_id" uuid,
  "request_id" uuid,
  "booking_id" uuid,
  "file_name" text NOT NULL,
  "storage_path" text NOT NULL,
  "size_bytes" bigint,
  "mime_type" text,
  "uploaded_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."documents" TO "anon";
GRANT INSERT ON TABLE public."documents" TO "anon";
GRANT MAINTAIN ON TABLE public."documents" TO "anon";
GRANT REFERENCES ON TABLE public."documents" TO "anon";
GRANT SELECT ON TABLE public."documents" TO "anon";
GRANT TRIGGER ON TABLE public."documents" TO "anon";
GRANT TRUNCATE ON TABLE public."documents" TO "anon";
GRANT UPDATE ON TABLE public."documents" TO "anon";
GRANT DELETE ON TABLE public."documents" TO "authenticated";
GRANT INSERT ON TABLE public."documents" TO "authenticated";
GRANT MAINTAIN ON TABLE public."documents" TO "authenticated";
GRANT REFERENCES ON TABLE public."documents" TO "authenticated";
GRANT SELECT ON TABLE public."documents" TO "authenticated";
GRANT TRIGGER ON TABLE public."documents" TO "authenticated";
GRANT TRUNCATE ON TABLE public."documents" TO "authenticated";
GRANT UPDATE ON TABLE public."documents" TO "authenticated";
GRANT DELETE ON TABLE public."documents" TO "postgres";
GRANT INSERT ON TABLE public."documents" TO "postgres";
GRANT MAINTAIN ON TABLE public."documents" TO "postgres";
GRANT REFERENCES ON TABLE public."documents" TO "postgres";
GRANT SELECT ON TABLE public."documents" TO "postgres";
GRANT TRIGGER ON TABLE public."documents" TO "postgres";
GRANT TRUNCATE ON TABLE public."documents" TO "postgres";
GRANT UPDATE ON TABLE public."documents" TO "postgres";
GRANT INSERT ON TABLE public."documents" TO "sandbox_exec";
GRANT SELECT ON TABLE public."documents" TO "sandbox_exec";
GRANT DELETE ON TABLE public."documents" TO "service_role";
GRANT INSERT ON TABLE public."documents" TO "service_role";
GRANT MAINTAIN ON TABLE public."documents" TO "service_role";
GRANT REFERENCES ON TABLE public."documents" TO "service_role";
GRANT SELECT ON TABLE public."documents" TO "service_role";
GRANT TRIGGER ON TABLE public."documents" TO "service_role";
GRANT TRUNCATE ON TABLE public."documents" TO "service_role";
GRANT UPDATE ON TABLE public."documents" TO "service_role";
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."office_invitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" app_role DEFAULT 'employee'::app_role NOT NULL,
  "token_hash" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "invited_by" uuid NOT NULL,
  "send_status" text DEFAULT 'pending'::text NOT NULL,
  "send_error" text,
  "send_attempts" integer DEFAULT 0 NOT NULL,
  "last_sent_at" timestamp with time zone,
  "failed_accepts" integer DEFAULT 0 NOT NULL,
  "accepted_by" uuid,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rotation_count" integer DEFAULT 0 NOT NULL,
  "last_rotated_at" timestamp with time zone
);
GRANT DELETE ON TABLE public."office_invitations" TO "anon";
GRANT INSERT ON TABLE public."office_invitations" TO "anon";
GRANT MAINTAIN ON TABLE public."office_invitations" TO "anon";
GRANT REFERENCES ON TABLE public."office_invitations" TO "anon";
GRANT SELECT ON TABLE public."office_invitations" TO "anon";
GRANT TRIGGER ON TABLE public."office_invitations" TO "anon";
GRANT TRUNCATE ON TABLE public."office_invitations" TO "anon";
GRANT UPDATE ON TABLE public."office_invitations" TO "anon";
GRANT DELETE ON TABLE public."office_invitations" TO "authenticated";
GRANT INSERT ON TABLE public."office_invitations" TO "authenticated";
GRANT MAINTAIN ON TABLE public."office_invitations" TO "authenticated";
GRANT REFERENCES ON TABLE public."office_invitations" TO "authenticated";
GRANT TRIGGER ON TABLE public."office_invitations" TO "authenticated";
GRANT TRUNCATE ON TABLE public."office_invitations" TO "authenticated";
GRANT UPDATE ON TABLE public."office_invitations" TO "authenticated";
GRANT DELETE ON TABLE public."office_invitations" TO "postgres";
GRANT INSERT ON TABLE public."office_invitations" TO "postgres";
GRANT MAINTAIN ON TABLE public."office_invitations" TO "postgres";
GRANT REFERENCES ON TABLE public."office_invitations" TO "postgres";
GRANT SELECT ON TABLE public."office_invitations" TO "postgres";
GRANT TRIGGER ON TABLE public."office_invitations" TO "postgres";
GRANT TRUNCATE ON TABLE public."office_invitations" TO "postgres";
GRANT UPDATE ON TABLE public."office_invitations" TO "postgres";
GRANT INSERT ON TABLE public."office_invitations" TO "sandbox_exec";
GRANT SELECT ON TABLE public."office_invitations" TO "sandbox_exec";
GRANT DELETE ON TABLE public."office_invitations" TO "service_role";
GRANT INSERT ON TABLE public."office_invitations" TO "service_role";
GRANT MAINTAIN ON TABLE public."office_invitations" TO "service_role";
GRANT REFERENCES ON TABLE public."office_invitations" TO "service_role";
GRANT SELECT ON TABLE public."office_invitations" TO "service_role";
GRANT TRIGGER ON TABLE public."office_invitations" TO "service_role";
GRANT TRUNCATE ON TABLE public."office_invitations" TO "service_role";
GRANT UPDATE ON TABLE public."office_invitations" TO "service_role";
GRANT SELECT ("accepted_at") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("accepted_by") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("created_at") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("email") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("expires_at") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("failed_accepts") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("id") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("invited_by") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("last_sent_at") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("office_id") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("revoked_at") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("role") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("send_attempts") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("send_error") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("send_status") ON public."office_invitations" TO "authenticated";
GRANT SELECT ("status") ON public."office_invitations" TO "authenticated";
ALTER TABLE public."office_invitations" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."office_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" app_role DEFAULT 'employee'::app_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone
);
GRANT DELETE ON TABLE public."office_members" TO "anon";
GRANT INSERT ON TABLE public."office_members" TO "anon";
GRANT MAINTAIN ON TABLE public."office_members" TO "anon";
GRANT REFERENCES ON TABLE public."office_members" TO "anon";
GRANT SELECT ON TABLE public."office_members" TO "anon";
GRANT TRIGGER ON TABLE public."office_members" TO "anon";
GRANT TRUNCATE ON TABLE public."office_members" TO "anon";
GRANT UPDATE ON TABLE public."office_members" TO "anon";
GRANT DELETE ON TABLE public."office_members" TO "authenticated";
GRANT INSERT ON TABLE public."office_members" TO "authenticated";
GRANT MAINTAIN ON TABLE public."office_members" TO "authenticated";
GRANT REFERENCES ON TABLE public."office_members" TO "authenticated";
GRANT SELECT ON TABLE public."office_members" TO "authenticated";
GRANT TRIGGER ON TABLE public."office_members" TO "authenticated";
GRANT TRUNCATE ON TABLE public."office_members" TO "authenticated";
GRANT UPDATE ON TABLE public."office_members" TO "authenticated";
GRANT DELETE ON TABLE public."office_members" TO "postgres";
GRANT INSERT ON TABLE public."office_members" TO "postgres";
GRANT MAINTAIN ON TABLE public."office_members" TO "postgres";
GRANT REFERENCES ON TABLE public."office_members" TO "postgres";
GRANT SELECT ON TABLE public."office_members" TO "postgres";
GRANT TRIGGER ON TABLE public."office_members" TO "postgres";
GRANT TRUNCATE ON TABLE public."office_members" TO "postgres";
GRANT UPDATE ON TABLE public."office_members" TO "postgres";
GRANT INSERT ON TABLE public."office_members" TO "sandbox_exec";
GRANT SELECT ON TABLE public."office_members" TO "sandbox_exec";
GRANT DELETE ON TABLE public."office_members" TO "service_role";
GRANT INSERT ON TABLE public."office_members" TO "service_role";
GRANT MAINTAIN ON TABLE public."office_members" TO "service_role";
GRANT REFERENCES ON TABLE public."office_members" TO "service_role";
GRANT SELECT ON TABLE public."office_members" TO "service_role";
GRANT TRIGGER ON TABLE public."office_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."office_members" TO "service_role";
GRANT UPDATE ON TABLE public."office_members" TO "service_role";
ALTER TABLE public."office_members" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."offices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "country" text,
  "city" text,
  "created_by" uuid DEFAULT auth.uid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."offices" TO "anon";
GRANT INSERT ON TABLE public."offices" TO "anon";
GRANT MAINTAIN ON TABLE public."offices" TO "anon";
GRANT REFERENCES ON TABLE public."offices" TO "anon";
GRANT SELECT ON TABLE public."offices" TO "anon";
GRANT TRIGGER ON TABLE public."offices" TO "anon";
GRANT TRUNCATE ON TABLE public."offices" TO "anon";
GRANT UPDATE ON TABLE public."offices" TO "anon";
GRANT DELETE ON TABLE public."offices" TO "authenticated";
GRANT INSERT ON TABLE public."offices" TO "authenticated";
GRANT MAINTAIN ON TABLE public."offices" TO "authenticated";
GRANT REFERENCES ON TABLE public."offices" TO "authenticated";
GRANT SELECT ON TABLE public."offices" TO "authenticated";
GRANT TRIGGER ON TABLE public."offices" TO "authenticated";
GRANT TRUNCATE ON TABLE public."offices" TO "authenticated";
GRANT UPDATE ON TABLE public."offices" TO "authenticated";
GRANT DELETE ON TABLE public."offices" TO "postgres";
GRANT INSERT ON TABLE public."offices" TO "postgres";
GRANT MAINTAIN ON TABLE public."offices" TO "postgres";
GRANT REFERENCES ON TABLE public."offices" TO "postgres";
GRANT SELECT ON TABLE public."offices" TO "postgres";
GRANT TRIGGER ON TABLE public."offices" TO "postgres";
GRANT TRUNCATE ON TABLE public."offices" TO "postgres";
GRANT UPDATE ON TABLE public."offices" TO "postgres";
GRANT INSERT ON TABLE public."offices" TO "sandbox_exec";
GRANT SELECT ON TABLE public."offices" TO "sandbox_exec";
GRANT DELETE ON TABLE public."offices" TO "service_role";
GRANT INSERT ON TABLE public."offices" TO "service_role";
GRANT MAINTAIN ON TABLE public."offices" TO "service_role";
GRANT REFERENCES ON TABLE public."offices" TO "service_role";
GRANT SELECT ON TABLE public."offices" TO "service_role";
GRANT TRIGGER ON TABLE public."offices" TO "service_role";
GRANT TRUNCATE ON TABLE public."offices" TO "service_role";
GRANT UPDATE ON TABLE public."offices" TO "service_role";
ALTER TABLE public."offices" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."partner_offices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "country" text,
  "city" text,
  "contact_person" text,
  "notes" text,
  "status" partner_status DEFAULT 'active'::partner_status NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."partner_offices" TO "anon";
GRANT INSERT ON TABLE public."partner_offices" TO "anon";
GRANT MAINTAIN ON TABLE public."partner_offices" TO "anon";
GRANT REFERENCES ON TABLE public."partner_offices" TO "anon";
GRANT SELECT ON TABLE public."partner_offices" TO "anon";
GRANT TRIGGER ON TABLE public."partner_offices" TO "anon";
GRANT TRUNCATE ON TABLE public."partner_offices" TO "anon";
GRANT UPDATE ON TABLE public."partner_offices" TO "anon";
GRANT DELETE ON TABLE public."partner_offices" TO "authenticated";
GRANT INSERT ON TABLE public."partner_offices" TO "authenticated";
GRANT MAINTAIN ON TABLE public."partner_offices" TO "authenticated";
GRANT REFERENCES ON TABLE public."partner_offices" TO "authenticated";
GRANT SELECT ON TABLE public."partner_offices" TO "authenticated";
GRANT TRIGGER ON TABLE public."partner_offices" TO "authenticated";
GRANT TRUNCATE ON TABLE public."partner_offices" TO "authenticated";
GRANT UPDATE ON TABLE public."partner_offices" TO "authenticated";
GRANT DELETE ON TABLE public."partner_offices" TO "postgres";
GRANT INSERT ON TABLE public."partner_offices" TO "postgres";
GRANT MAINTAIN ON TABLE public."partner_offices" TO "postgres";
GRANT REFERENCES ON TABLE public."partner_offices" TO "postgres";
GRANT SELECT ON TABLE public."partner_offices" TO "postgres";
GRANT TRIGGER ON TABLE public."partner_offices" TO "postgres";
GRANT TRUNCATE ON TABLE public."partner_offices" TO "postgres";
GRANT UPDATE ON TABLE public."partner_offices" TO "postgres";
GRANT INSERT ON TABLE public."partner_offices" TO "sandbox_exec";
GRANT SELECT ON TABLE public."partner_offices" TO "sandbox_exec";
GRANT DELETE ON TABLE public."partner_offices" TO "service_role";
GRANT INSERT ON TABLE public."partner_offices" TO "service_role";
GRANT MAINTAIN ON TABLE public."partner_offices" TO "service_role";
GRANT REFERENCES ON TABLE public."partner_offices" TO "service_role";
GRANT SELECT ON TABLE public."partner_offices" TO "service_role";
GRANT TRIGGER ON TABLE public."partner_offices" TO "service_role";
GRANT TRUNCATE ON TABLE public."partner_offices" TO "service_role";
GRANT UPDATE ON TABLE public."partner_offices" TO "service_role";
ALTER TABLE public."partner_offices" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."platform_owners" (
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."platform_owners" TO "anon";
GRANT INSERT ON TABLE public."platform_owners" TO "anon";
GRANT MAINTAIN ON TABLE public."platform_owners" TO "anon";
GRANT REFERENCES ON TABLE public."platform_owners" TO "anon";
GRANT SELECT ON TABLE public."platform_owners" TO "anon";
GRANT TRIGGER ON TABLE public."platform_owners" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_owners" TO "anon";
GRANT UPDATE ON TABLE public."platform_owners" TO "anon";
GRANT DELETE ON TABLE public."platform_owners" TO "authenticated";
GRANT INSERT ON TABLE public."platform_owners" TO "authenticated";
GRANT MAINTAIN ON TABLE public."platform_owners" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_owners" TO "authenticated";
GRANT SELECT ON TABLE public."platform_owners" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_owners" TO "authenticated";
GRANT TRUNCATE ON TABLE public."platform_owners" TO "authenticated";
GRANT UPDATE ON TABLE public."platform_owners" TO "authenticated";
GRANT DELETE ON TABLE public."platform_owners" TO "postgres";
GRANT INSERT ON TABLE public."platform_owners" TO "postgres";
GRANT MAINTAIN ON TABLE public."platform_owners" TO "postgres";
GRANT REFERENCES ON TABLE public."platform_owners" TO "postgres";
GRANT SELECT ON TABLE public."platform_owners" TO "postgres";
GRANT TRIGGER ON TABLE public."platform_owners" TO "postgres";
GRANT TRUNCATE ON TABLE public."platform_owners" TO "postgres";
GRANT UPDATE ON TABLE public."platform_owners" TO "postgres";
GRANT INSERT ON TABLE public."platform_owners" TO "sandbox_exec";
GRANT SELECT ON TABLE public."platform_owners" TO "sandbox_exec";
GRANT DELETE ON TABLE public."platform_owners" TO "service_role";
GRANT INSERT ON TABLE public."platform_owners" TO "service_role";
GRANT MAINTAIN ON TABLE public."platform_owners" TO "service_role";
GRANT REFERENCES ON TABLE public."platform_owners" TO "service_role";
GRANT SELECT ON TABLE public."platform_owners" TO "service_role";
GRANT TRIGGER ON TABLE public."platform_owners" TO "service_role";
GRANT TRUNCATE ON TABLE public."platform_owners" TO "service_role";
GRANT UPDATE ON TABLE public."platform_owners" TO "service_role";
ALTER TABLE public."platform_owners" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."platform_owners" IS 'Platform owner role. Granted server-side only; no insert/update/delete from the app.';
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "full_name" text,
  "email" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."profiles" TO "anon";
GRANT INSERT ON TABLE public."profiles" TO "anon";
GRANT MAINTAIN ON TABLE public."profiles" TO "anon";
GRANT REFERENCES ON TABLE public."profiles" TO "anon";
GRANT SELECT ON TABLE public."profiles" TO "anon";
GRANT TRIGGER ON TABLE public."profiles" TO "anon";
GRANT TRUNCATE ON TABLE public."profiles" TO "anon";
GRANT UPDATE ON TABLE public."profiles" TO "anon";
GRANT DELETE ON TABLE public."profiles" TO "authenticated";
GRANT INSERT ON TABLE public."profiles" TO "authenticated";
GRANT MAINTAIN ON TABLE public."profiles" TO "authenticated";
GRANT REFERENCES ON TABLE public."profiles" TO "authenticated";
GRANT SELECT ON TABLE public."profiles" TO "authenticated";
GRANT TRIGGER ON TABLE public."profiles" TO "authenticated";
GRANT TRUNCATE ON TABLE public."profiles" TO "authenticated";
GRANT UPDATE ON TABLE public."profiles" TO "authenticated";
GRANT DELETE ON TABLE public."profiles" TO "postgres";
GRANT INSERT ON TABLE public."profiles" TO "postgres";
GRANT MAINTAIN ON TABLE public."profiles" TO "postgres";
GRANT REFERENCES ON TABLE public."profiles" TO "postgres";
GRANT SELECT ON TABLE public."profiles" TO "postgres";
GRANT TRIGGER ON TABLE public."profiles" TO "postgres";
GRANT TRUNCATE ON TABLE public."profiles" TO "postgres";
GRANT UPDATE ON TABLE public."profiles" TO "postgres";
GRANT INSERT ON TABLE public."profiles" TO "sandbox_exec";
GRANT SELECT ON TABLE public."profiles" TO "sandbox_exec";
GRANT DELETE ON TABLE public."profiles" TO "service_role";
GRANT INSERT ON TABLE public."profiles" TO "service_role";
GRANT MAINTAIN ON TABLE public."profiles" TO "service_role";
GRANT REFERENCES ON TABLE public."profiles" TO "service_role";
GRANT SELECT ON TABLE public."profiles" TO "service_role";
GRANT TRIGGER ON TABLE public."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE public."profiles" TO "service_role";
GRANT UPDATE ON TABLE public."profiles" TO "service_role";
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "number" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."requests_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "office_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "service_id" uuid,
  "details" text,
  "source" request_source DEFAULT 'direct'::request_source NOT NULL,
  "referring_partner_id" uuid,
  "assigned_to" uuid,
  "service_date" date,
  "priority" request_priority DEFAULT 'normal'::request_priority NOT NULL,
  "status" request_status DEFAULT 'new'::request_status NOT NULL,
  "notes" text,
  "booking_ref" text,
  "booked_at" timestamp with time zone,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "service_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid,
  "completed_by" uuid,
  "completed_at" timestamp with time zone,
  "cancelled_by" uuid,
  "cancelled_at" timestamp with time zone
);
GRANT DELETE ON TABLE public."requests" TO "anon";
GRANT INSERT ON TABLE public."requests" TO "anon";
GRANT MAINTAIN ON TABLE public."requests" TO "anon";
GRANT REFERENCES ON TABLE public."requests" TO "anon";
GRANT SELECT ON TABLE public."requests" TO "anon";
GRANT TRIGGER ON TABLE public."requests" TO "anon";
GRANT TRUNCATE ON TABLE public."requests" TO "anon";
GRANT UPDATE ON TABLE public."requests" TO "anon";
GRANT DELETE ON TABLE public."requests" TO "authenticated";
GRANT INSERT ON TABLE public."requests" TO "authenticated";
GRANT MAINTAIN ON TABLE public."requests" TO "authenticated";
GRANT REFERENCES ON TABLE public."requests" TO "authenticated";
GRANT SELECT ON TABLE public."requests" TO "authenticated";
GRANT TRIGGER ON TABLE public."requests" TO "authenticated";
GRANT TRUNCATE ON TABLE public."requests" TO "authenticated";
GRANT UPDATE ON TABLE public."requests" TO "authenticated";
GRANT DELETE ON TABLE public."requests" TO "postgres";
GRANT INSERT ON TABLE public."requests" TO "postgres";
GRANT MAINTAIN ON TABLE public."requests" TO "postgres";
GRANT REFERENCES ON TABLE public."requests" TO "postgres";
GRANT SELECT ON TABLE public."requests" TO "postgres";
GRANT TRIGGER ON TABLE public."requests" TO "postgres";
GRANT TRUNCATE ON TABLE public."requests" TO "postgres";
GRANT UPDATE ON TABLE public."requests" TO "postgres";
GRANT INSERT ON TABLE public."requests" TO "sandbox_exec";
GRANT SELECT ON TABLE public."requests" TO "sandbox_exec";
GRANT DELETE ON TABLE public."requests" TO "service_role";
GRANT INSERT ON TABLE public."requests" TO "service_role";
GRANT MAINTAIN ON TABLE public."requests" TO "service_role";
GRANT REFERENCES ON TABLE public."requests" TO "service_role";
GRANT SELECT ON TABLE public."requests" TO "service_role";
GRANT TRIGGER ON TABLE public."requests" TO "service_role";
GRANT TRUNCATE ON TABLE public."requests" TO "service_role";
GRANT UPDATE ON TABLE public."requests" TO "service_role";
ALTER TABLE public."requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."services" TO "anon";
GRANT INSERT ON TABLE public."services" TO "anon";
GRANT MAINTAIN ON TABLE public."services" TO "anon";
GRANT REFERENCES ON TABLE public."services" TO "anon";
GRANT SELECT ON TABLE public."services" TO "anon";
GRANT TRIGGER ON TABLE public."services" TO "anon";
GRANT TRUNCATE ON TABLE public."services" TO "anon";
GRANT UPDATE ON TABLE public."services" TO "anon";
GRANT DELETE ON TABLE public."services" TO "authenticated";
GRANT INSERT ON TABLE public."services" TO "authenticated";
GRANT MAINTAIN ON TABLE public."services" TO "authenticated";
GRANT REFERENCES ON TABLE public."services" TO "authenticated";
GRANT SELECT ON TABLE public."services" TO "authenticated";
GRANT TRIGGER ON TABLE public."services" TO "authenticated";
GRANT TRUNCATE ON TABLE public."services" TO "authenticated";
GRANT UPDATE ON TABLE public."services" TO "authenticated";
GRANT DELETE ON TABLE public."services" TO "postgres";
GRANT INSERT ON TABLE public."services" TO "postgres";
GRANT MAINTAIN ON TABLE public."services" TO "postgres";
GRANT REFERENCES ON TABLE public."services" TO "postgres";
GRANT SELECT ON TABLE public."services" TO "postgres";
GRANT TRIGGER ON TABLE public."services" TO "postgres";
GRANT TRUNCATE ON TABLE public."services" TO "postgres";
GRANT UPDATE ON TABLE public."services" TO "postgres";
GRANT INSERT ON TABLE public."services" TO "sandbox_exec";
GRANT SELECT ON TABLE public."services" TO "sandbox_exec";
GRANT DELETE ON TABLE public."services" TO "service_role";
GRANT INSERT ON TABLE public."services" TO "service_role";
GRANT MAINTAIN ON TABLE public."services" TO "service_role";
GRANT REFERENCES ON TABLE public."services" TO "service_role";
GRANT SELECT ON TABLE public."services" TO "service_role";
GRANT TRIGGER ON TABLE public."services" TO "service_role";
GRANT TRUNCATE ON TABLE public."services" TO "service_role";
GRANT UPDATE ON TABLE public."services" TO "service_role";
ALTER TABLE public."services" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "title" text NOT NULL,
  "task_type" task_type DEFAULT 'other'::task_type NOT NULL,
  "assigned_to" uuid,
  "customer_id" uuid,
  "request_id" uuid,
  "booking_id" uuid,
  "service_id" uuid,
  "due_at" timestamp with time zone,
  "priority" task_priority DEFAULT 'medium'::task_priority NOT NULL,
  "status" task_status DEFAULT 'new'::task_status NOT NULL,
  "notes" text,
  "flight_number" text,
  "airport" text,
  "arrival_at" timestamp with time zone,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);
GRANT DELETE ON TABLE public."tasks" TO "anon";
GRANT INSERT ON TABLE public."tasks" TO "anon";
GRANT MAINTAIN ON TABLE public."tasks" TO "anon";
GRANT REFERENCES ON TABLE public."tasks" TO "anon";
GRANT SELECT ON TABLE public."tasks" TO "anon";
GRANT TRIGGER ON TABLE public."tasks" TO "anon";
GRANT TRUNCATE ON TABLE public."tasks" TO "anon";
GRANT UPDATE ON TABLE public."tasks" TO "anon";
GRANT DELETE ON TABLE public."tasks" TO "authenticated";
GRANT INSERT ON TABLE public."tasks" TO "authenticated";
GRANT MAINTAIN ON TABLE public."tasks" TO "authenticated";
GRANT REFERENCES ON TABLE public."tasks" TO "authenticated";
GRANT SELECT ON TABLE public."tasks" TO "authenticated";
GRANT TRIGGER ON TABLE public."tasks" TO "authenticated";
GRANT TRUNCATE ON TABLE public."tasks" TO "authenticated";
GRANT UPDATE ON TABLE public."tasks" TO "authenticated";
GRANT DELETE ON TABLE public."tasks" TO "postgres";
GRANT INSERT ON TABLE public."tasks" TO "postgres";
GRANT MAINTAIN ON TABLE public."tasks" TO "postgres";
GRANT REFERENCES ON TABLE public."tasks" TO "postgres";
GRANT SELECT ON TABLE public."tasks" TO "postgres";
GRANT TRIGGER ON TABLE public."tasks" TO "postgres";
GRANT TRUNCATE ON TABLE public."tasks" TO "postgres";
GRANT UPDATE ON TABLE public."tasks" TO "postgres";
GRANT INSERT ON TABLE public."tasks" TO "sandbox_exec";
GRANT SELECT ON TABLE public."tasks" TO "sandbox_exec";
GRANT DELETE ON TABLE public."tasks" TO "service_role";
GRANT INSERT ON TABLE public."tasks" TO "service_role";
GRANT MAINTAIN ON TABLE public."tasks" TO "service_role";
GRANT REFERENCES ON TABLE public."tasks" TO "service_role";
GRANT SELECT ON TABLE public."tasks" TO "service_role";
GRANT TRIGGER ON TABLE public."tasks" TO "service_role";
GRANT TRUNCATE ON TABLE public."tasks" TO "service_role";
GRANT UPDATE ON TABLE public."tasks" TO "service_role";
ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."umrah_participants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "trip_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "request_id" uuid,
  "status" umrah_pilgrim_status DEFAULT 'registered'::umrah_pilgrim_status NOT NULL,
  "planned_entry" date,
  "planned_exit" date,
  "actual_entry" date,
  "actual_exit" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."umrah_participants" TO "anon";
GRANT INSERT ON TABLE public."umrah_participants" TO "anon";
GRANT MAINTAIN ON TABLE public."umrah_participants" TO "anon";
GRANT REFERENCES ON TABLE public."umrah_participants" TO "anon";
GRANT SELECT ON TABLE public."umrah_participants" TO "anon";
GRANT TRIGGER ON TABLE public."umrah_participants" TO "anon";
GRANT TRUNCATE ON TABLE public."umrah_participants" TO "anon";
GRANT UPDATE ON TABLE public."umrah_participants" TO "anon";
GRANT DELETE ON TABLE public."umrah_participants" TO "authenticated";
GRANT INSERT ON TABLE public."umrah_participants" TO "authenticated";
GRANT MAINTAIN ON TABLE public."umrah_participants" TO "authenticated";
GRANT REFERENCES ON TABLE public."umrah_participants" TO "authenticated";
GRANT SELECT ON TABLE public."umrah_participants" TO "authenticated";
GRANT TRIGGER ON TABLE public."umrah_participants" TO "authenticated";
GRANT TRUNCATE ON TABLE public."umrah_participants" TO "authenticated";
GRANT UPDATE ON TABLE public."umrah_participants" TO "authenticated";
GRANT DELETE ON TABLE public."umrah_participants" TO "postgres";
GRANT INSERT ON TABLE public."umrah_participants" TO "postgres";
GRANT MAINTAIN ON TABLE public."umrah_participants" TO "postgres";
GRANT REFERENCES ON TABLE public."umrah_participants" TO "postgres";
GRANT SELECT ON TABLE public."umrah_participants" TO "postgres";
GRANT TRIGGER ON TABLE public."umrah_participants" TO "postgres";
GRANT TRUNCATE ON TABLE public."umrah_participants" TO "postgres";
GRANT UPDATE ON TABLE public."umrah_participants" TO "postgres";
GRANT INSERT ON TABLE public."umrah_participants" TO "sandbox_exec";
GRANT SELECT ON TABLE public."umrah_participants" TO "sandbox_exec";
GRANT DELETE ON TABLE public."umrah_participants" TO "service_role";
GRANT INSERT ON TABLE public."umrah_participants" TO "service_role";
GRANT MAINTAIN ON TABLE public."umrah_participants" TO "service_role";
GRANT REFERENCES ON TABLE public."umrah_participants" TO "service_role";
GRANT SELECT ON TABLE public."umrah_participants" TO "service_role";
GRANT TRIGGER ON TABLE public."umrah_participants" TO "service_role";
GRANT TRUNCATE ON TABLE public."umrah_participants" TO "service_role";
GRANT UPDATE ON TABLE public."umrah_participants" TO "service_role";
ALTER TABLE public."umrah_participants" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."umrah_trips" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid NOT NULL,
  "name" text NOT NULL,
  "planned_start" date,
  "planned_end" date,
  "status" umrah_trip_status DEFAULT 'planned'::umrah_trip_status NOT NULL,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
GRANT DELETE ON TABLE public."umrah_trips" TO "anon";
GRANT INSERT ON TABLE public."umrah_trips" TO "anon";
GRANT MAINTAIN ON TABLE public."umrah_trips" TO "anon";
GRANT REFERENCES ON TABLE public."umrah_trips" TO "anon";
GRANT SELECT ON TABLE public."umrah_trips" TO "anon";
GRANT TRIGGER ON TABLE public."umrah_trips" TO "anon";
GRANT TRUNCATE ON TABLE public."umrah_trips" TO "anon";
GRANT UPDATE ON TABLE public."umrah_trips" TO "anon";
GRANT DELETE ON TABLE public."umrah_trips" TO "authenticated";
GRANT INSERT ON TABLE public."umrah_trips" TO "authenticated";
GRANT MAINTAIN ON TABLE public."umrah_trips" TO "authenticated";
GRANT REFERENCES ON TABLE public."umrah_trips" TO "authenticated";
GRANT SELECT ON TABLE public."umrah_trips" TO "authenticated";
GRANT TRIGGER ON TABLE public."umrah_trips" TO "authenticated";
GRANT TRUNCATE ON TABLE public."umrah_trips" TO "authenticated";
GRANT UPDATE ON TABLE public."umrah_trips" TO "authenticated";
GRANT DELETE ON TABLE public."umrah_trips" TO "postgres";
GRANT INSERT ON TABLE public."umrah_trips" TO "postgres";
GRANT MAINTAIN ON TABLE public."umrah_trips" TO "postgres";
GRANT REFERENCES ON TABLE public."umrah_trips" TO "postgres";
GRANT SELECT ON TABLE public."umrah_trips" TO "postgres";
GRANT TRIGGER ON TABLE public."umrah_trips" TO "postgres";
GRANT TRUNCATE ON TABLE public."umrah_trips" TO "postgres";
GRANT UPDATE ON TABLE public."umrah_trips" TO "postgres";
GRANT INSERT ON TABLE public."umrah_trips" TO "sandbox_exec";
GRANT SELECT ON TABLE public."umrah_trips" TO "sandbox_exec";
GRANT DELETE ON TABLE public."umrah_trips" TO "service_role";
GRANT INSERT ON TABLE public."umrah_trips" TO "service_role";
GRANT MAINTAIN ON TABLE public."umrah_trips" TO "service_role";
GRANT REFERENCES ON TABLE public."umrah_trips" TO "service_role";
GRANT SELECT ON TABLE public."umrah_trips" TO "service_role";
GRANT TRIGGER ON TABLE public."umrah_trips" TO "service_role";
GRANT TRUNCATE ON TABLE public."umrah_trips" TO "service_role";
GRANT UPDATE ON TABLE public."umrah_trips" TO "service_role";
ALTER TABLE public."umrah_trips" ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN public."office_invitations"."send_status" IS 'pending=created; manual_link/not_configured=no email sent; send_attempted; provider_accepted=provider took the message (not proof of delivery); delivered=only from verified provider event; failed. Legacy value sent means provider_accepted.';
COMMENT ON COLUMN public."requests"."service_details" IS 'Service-specific fields of a transaction (flight, hotel, visa, tour...), keyed by field name.';
GRANT SELECT ON SEQUENCE public."bookings_number_seq" TO "anon";
GRANT UPDATE ON SEQUENCE public."bookings_number_seq" TO "anon";
GRANT USAGE ON SEQUENCE public."bookings_number_seq" TO "anon";
GRANT SELECT ON SEQUENCE public."bookings_number_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE public."bookings_number_seq" TO "authenticated";
GRANT USAGE ON SEQUENCE public."bookings_number_seq" TO "authenticated";
GRANT SELECT ON SEQUENCE public."bookings_number_seq" TO "postgres";
GRANT UPDATE ON SEQUENCE public."bookings_number_seq" TO "postgres";
GRANT USAGE ON SEQUENCE public."bookings_number_seq" TO "postgres";
GRANT SELECT ON SEQUENCE public."bookings_number_seq" TO "sandbox_exec";
GRANT USAGE ON SEQUENCE public."bookings_number_seq" TO "sandbox_exec";
GRANT SELECT ON SEQUENCE public."bookings_number_seq" TO "service_role";
GRANT UPDATE ON SEQUENCE public."bookings_number_seq" TO "service_role";
GRANT USAGE ON SEQUENCE public."bookings_number_seq" TO "service_role";
GRANT SELECT ON SEQUENCE public."requests_number_seq" TO "anon";
GRANT UPDATE ON SEQUENCE public."requests_number_seq" TO "anon";
GRANT USAGE ON SEQUENCE public."requests_number_seq" TO "anon";
GRANT SELECT ON SEQUENCE public."requests_number_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE public."requests_number_seq" TO "authenticated";
GRANT USAGE ON SEQUENCE public."requests_number_seq" TO "authenticated";
GRANT SELECT ON SEQUENCE public."requests_number_seq" TO "postgres";
GRANT UPDATE ON SEQUENCE public."requests_number_seq" TO "postgres";
GRANT USAGE ON SEQUENCE public."requests_number_seq" TO "postgres";
GRANT SELECT ON SEQUENCE public."requests_number_seq" TO "sandbox_exec";
GRANT USAGE ON SEQUENCE public."requests_number_seq" TO "sandbox_exec";
GRANT SELECT ON SEQUENCE public."requests_number_seq" TO "service_role";
GRANT UPDATE ON SEQUENCE public."requests_number_seq" TO "service_role";
GRANT USAGE ON SEQUENCE public."requests_number_seq" TO "service_role";
