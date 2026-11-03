REVOKE ALL ON public.work_record_permissions, public.deletion_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.work_record_permissions, public.deletion_jobs FROM authenticated;
GRANT SELECT ON public.work_record_permissions, public.deletion_jobs TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
