This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Knowledge base ingestion

Content gets into the knowledge base in two ways. Both feed the same pipeline: **split into chunks → upsert to Pinecone, which embeds the text itself → record the document in Supabase**. The chat endpoint (`POST /api/chat`) searches the same index. Content that was already ingested (same text, ignoring whitespace) is detected by hash and skipped.

| Method | Endpoint | Accepts |
| --- | --- | --- |
| Direct upload | `POST /api/ingest/text` | JSON `{ "title", "content" }`, or multipart `file` (`.md`, `.markdown`, `.txt`, ≤ 1 MB) with an optional `title` |
| Web page scraping | `POST /api/ingest/url` | JSON `{ "url" }` for a single public `http(s)` page (HTML, plain text or markdown, ≤ 2 MB) |

There's also a developer page at [`/ingest`](http://localhost:3000/ingest) with a form for each method.

### Setup

1. **Env vars:** `cp .env.example .env.local` and fill in the Pinecone and Supabase keys, plus the Gemini key that chat uses. The Supabase **service role** key is used server-side only. Never prefix it with `NEXT_PUBLIC_`.
2. **Pinecone:** use an index with **integrated embedding on a `chunk_text` field**, the same index `/api/chat` reads, and put its name in `PINECONE_INDEX`. Chunks go into the default namespace.
3. **Supabase:** apply `supabase/migrations/20261104000000_create_documents.sql`, either with `supabase db push` or by pasting it into the SQL editor. It creates the `documents` table with RLS enabled and no policies, so only the service role can read or write it.

### Examples

```bash
# Pasted text
curl -X POST http://localhost:3000/api/ingest/text \
  -H 'content-type: application/json' \
  -d '{"title":"Server Actions notes","content":"Server Actions are async functions..."}'

# File upload
curl -X POST http://localhost:3000/api/ingest/text -F file=@notes.md

# Web page
curl -X POST http://localhost:3000/api/ingest/url \
  -H 'content-type: application/json' \
  -d '{"url":"https://nextjs.org/docs/app/getting-started/route-handlers"}'
```

Responses:
- `201` `{ status: "ready", documentId, title, chunkCount }` for new content.
- `200` `{ status: "duplicate", documentId, title, existingStatus }` when the content is already stored.
- Errors are `{ error }` with status `400` (bad input), `413` (too large), `502` (the page or Pinecone failed) or `500`.

A document that failed earlier is retried under the same id the next time it's submitted.

Each chunk is stored in Pinecone as `{ _id: "<documentId>#<chunkIndex>", chunk_text, title, source_url, document_id }`, with `source_url` left empty for uploads. These field names are what `src/lib/rag/pinecone-retriever.ts` reads back, and `src/lib/ingest/retriever-contract.test.ts` checks that the two stay in sync.

### Notes and limits

- The ingest endpoints have **no authentication** yet. Run them locally only, or put them behind auth before deploying.
- The scraper refuses `localhost` and private or link-local addresses, and checks them again on every redirect. It fetches one page, with no crawling and no JavaScript rendering.
- PDF and DOCX aren't supported yet.
- **Adding a method:** write a `src/lib/ingest/sources/<name>.ts` that returns a `RawDocument`, plus a route that passes it to `ingestDocument`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
