-- PREPARED, NOT APPLIED. Independent local instance only.
-- Apply after the immutable six-file baseline and 20261030000700 overlay.
-- Customer deletion must not cascade around dependent-row RLS / Storage cleanup.
-- Foreign keys also protect against a concurrent child INSERT after UI preflight.
BEGIN;
ALTER TABLE public.requests DROP CONSTRAINT requests_customer_id_fkey,
  ADD CONSTRAINT requests_customer_id_fkey FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.bookings DROP CONSTRAINT bookings_customer_id_fkey,
  ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.documents DROP CONSTRAINT documents_customer_id_fkey,
  ADD CONSTRAINT documents_customer_id_fkey FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.tasks DROP CONSTRAINT tasks_customer_id_fkey,
  ADD CONSTRAINT tasks_customer_id_fkey FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE RESTRICT;
-- umrah_participants already has a blocking FK; leave it unchanged.
COMMIT;