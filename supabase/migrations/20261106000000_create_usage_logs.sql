-- One row per chatbot request, backing the admin usage-logs view (User Story 8).
create table if not exists public.usage_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  latency_ms  integer not null check (latency_ms >= 0),
  status      text not null check (status in ('ok', 'error')),
  grounded    boolean
);

create index if not exists usage_logs_created_at_idx on public.usage_logs (created_at desc);

-- Only the server (service role, which bypasses RLS) touches this table.
-- RLS with no policies keeps it closed to the anon/authenticated keys.
alter table public.usage_logs enable row level security;
