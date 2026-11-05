-- Keep the ingested text so uploaded documents can be shown at /documents/<id>,
-- which is what chat cites as their source.
alter table public.documents add column if not exists content text;
