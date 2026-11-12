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

Content gets into the knowledge base in two ways. Both feed the same pipeline: **clean the text → split it into section-aware chunks → upsert to Pinecone, which embeds the text itself → record the document in Supabase**. The chat endpoint (`POST /api/chat`) searches the same index. Content that was already ingested (same text, ignoring whitespace) is detected by hash and skipped.

| Method | Endpoint | Accepts |
| --- | --- | --- |
| Direct upload | `POST /api/ingest/text` | JSON `{ "title", "content" }`, or multipart `file` (`.md`, `.markdown`, `.txt`, ≤ 1 MB) with an optional `title` |
| Web page scraping | `POST /api/ingest/url` | JSON `{ "url" }` for a single public `http(s)` page (HTML, plain text or markdown, ≤ 2 MB) |

To update an existing source instead of adding a new dataset entry, include its Supabase document id as `documentId` in either request. The existing document id and citation links are preserved while its stored text and Pinecone chunks are replaced. The id is shown after a successful ingest and can also be found at `/documents/<id>`.

There's also a developer page at [`/ingest`](http://localhost:3000/ingest) with a form for each method.

### Admin knowledge base controls

The [`/admin`](http://localhost:3000/admin) page includes usage logs and controls to clear the chatbot's Pinecone namespace or reload it from the source documents and text retained in Supabase. Enter the `INGEST_API_KEY` on the page to load usage logs or use either knowledge-base action; the key is kept in this browser tab only. The usage API requires this key too. Clear keeps source documents but resets their status and chunk count; reload rebuilds the index from those saved sources. Reload starts by clearing the namespace, so a partial failure can leave some sources unindexed; the page reports which documents failed so they can be corrected and reloaded again.

Both endpoints require `Authorization: Bearer <INGEST_API_KEY>`. The `/ingest` page has a field for the key and keeps it in session storage. If `INGEST_API_KEY` isn't set on the server, the endpoints return `503` instead of accepting requests without a key.

### Setup

1. **Env vars:** `cp .env.example .env.local` and fill in the Pinecone and Supabase keys, plus the Gemini key that chat uses. The Supabase **service role** key is used server-side only. Never prefix it with `NEXT_PUBLIC_`.
2. **Pinecone:** use an index with **integrated embedding on a `chunk_text` field**, the same index `/api/chat` reads, and put its name in `PINECONE_INDEX`. Chunks go into the default namespace.
3. **Supabase:** apply the files in `supabase/migrations/` in order, either with `supabase db push` or by pasting each into the SQL editor. They create the `documents` table (RLS enabled with no policies, so only the service role can read or write it) and add the column that holds each document's text.

### Examples

```bash
export INGEST_API_KEY=...   # same value as in .env.local

# Pasted text
curl -X POST http://localhost:3000/api/ingest/text \
  -H "authorization: Bearer $INGEST_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"title":"Server Actions notes","content":"Server Actions are async functions..."}'

# File upload
curl -X POST http://localhost:3000/api/ingest/text \
  -H "authorization: Bearer $INGEST_API_KEY" -F file=@notes.md

# Web page
curl -X POST http://localhost:3000/api/ingest/url \
  -H "authorization: Bearer $INGEST_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"url":"https://nextjs.org/docs/app/getting-started/route-handlers"}'
```

Responses:
- `201` `{ status: "ready", documentId, title, chunkCount, cleaning }` for new content.
- `200` `{ status: "duplicate", documentId, title, existingStatus, cleaning }` when the content is already stored.
- `200` `{ status: "preview", title, cleanedContent, chunks, cleaning, wouldReject? }` with `?preview=1` (see below).
- Errors are `{ error }` with status `400` (bad input, or too little readable text after cleaning), `401` (missing or wrong key), `413` (too large), `502` (the page or Pinecone failed), `503` (`INGEST_API_KEY` not configured) or `500`.

A document that failed earlier is retried under the same id the next time it's submitted.

Each chunk is stored in Pinecone as `{ _id: "<documentId>#<chunkIndex>", chunk_text, title, source_url, document_id }`. `chunk_text` starts with a context line, `Title > Section > Subsection`, then a blank line and the chunk body. `source_url` is the page URL for scraped documents. For uploads and pasted text it's the app's own `/documents/<documentId>` page, a relative link that shows the stored text. These field names are what `src/lib/rag/pinecone-retriever.ts` reads back, and `src/lib/ingest/retriever-contract.test.ts` checks that the two stay in sync.

### Cleaning and preprocessing

Every document is cleaned in the shared pipeline (`src/lib/ingest/preprocess/`) before it is chunked, so both methods, and any future one, get the same treatment:

1. **Characters:** line endings, Unicode NFC, and removal of invisible and control characters (zero-width spaces, BOMs, soft hyphens), which break copied commands. Ligatures and odd spaces are normalized. NFKC isn't used, so `x²` and full-width text survive.
2. **Markup:** YAML front matter, HTML comments, reference-link definitions and inline HTML from a fixed tag list are removed. `[text](url)` becomes `text` and `![alt](src)` becomes `alt`. Placeholders such as `<your-password>` are kept.
3. **Boilerplate:** lines that are only site UI ("Copy", "Skip to main content", "Was this page helpful?", "Back to top", …) and cookie-consent banners are removed. So are repeated paragraphs, and short lines repeated 3 or more times (the first copy stays, and callout labels like "Warning" or "Note" are always kept).
4. **Whitespace:** space runs are collapsed and blank lines squeezed, keeping list indentation.

Code keeps its wording and layout. That covers fenced blocks (including fences indented under list items), indented blocks and inline `` `code` ``. Only the character fixes from step 1 reach inside code, because invisible characters and odd spaces break copied commands. Headings, list items and numbered steps, table rows (with or without outer pipes) and a label just before a code block, such as "Output:", are never treated as boilerplate.

The **cleaned** text is what gets hashed for duplicate detection, stored in Supabase and shown on `/documents/<id>`.

**Chunking** splits at markdown headings first, then by size (≤ 1000 chars including the context line). A section with under about 200 letters and digits is merged into its neighbour, with its heading kept inline, rather than stored as a tiny chunk.

**Quality gate:** a document with fewer than **100 letters or digits** left after cleaning is rejected with `400`.

**Seeing what happened:** ready and duplicate responses include `cleaning: { originalChars, cleanedChars, boilerplateLinesRemoved, duplicateBlocksRemoved, sectionsMerged }`. Add `?preview=1` to either endpoint, or use the **Preview** button on `/ingest`, to get the cleaned text and the exact chunks without storing anything. A preview of a document that would be rejected still returns `200`, with `wouldReject.reason`.

```bash
curl -X POST 'http://localhost:3000/api/ingest/text?preview=1' \
  -H "authorization: Bearer $INGEST_API_KEY" -F file=@notes.md
```

### Notes and limits

- The ingest key is a single shared secret, not per-user accounts. Rotate it by changing `INGEST_API_KEY`.
- The scraper refuses `localhost` and private or link-local addresses, and checks them again on every redirect. It fetches one page, with no crawling and no JavaScript rendering.
- PDF and DOCX aren't supported yet.
- Cleaning doesn't detect near-duplicates across documents, redact personal data or re-process documents that were ingested before cleaning existed.
- **Adding a method:** write a `src/lib/ingest/sources/<name>.ts` that returns a `RawDocument`, plus a route that passes it to `ingestDocument`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
