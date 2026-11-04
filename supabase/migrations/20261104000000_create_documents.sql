-- One row per ingested source document. Chunk vectors live in Pinecone,
-- keyed by `${id}#${chunkIndex}` with `documentId` in their metadata.
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null check (source_type in ('upload', 'url')),
  source_ref    text not null,
  title         text not null,
  content_hash  text not null unique,
  chunk_count   integer not null default 0,
  status        text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists documents_created_at_idx on public.documents (created_at desc);

-- Only the server (service role, which bypasses RLS) touches this table.
-- RLS with no policies keeps it closed to the anon/authenticated keys.
alter table public.documents enable row level security;
