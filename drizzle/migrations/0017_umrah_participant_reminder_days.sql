ALTER TABLE public.umrah_participants
  ADD COLUMN IF NOT EXISTS reminder_days smallint
  CONSTRAINT umrah_participants_reminder_days_range CHECK (reminder_days IS NULL OR reminder_days BETWEEN 0 AND 89);
COMMENT ON COLUMN public.umrah_participants.reminder_days IS 'Days before the end of the allowed stay to raise an alert; NULL means the application default (5).';