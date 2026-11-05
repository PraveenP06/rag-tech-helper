# User Story 7: Clean and preprocess data before ingestion (design)

> "As a Developer, I want to clean and preprocess data before ingestion, so retrieval results are accurate and relevant."

## Context
User Story 6 added two ingestion methods: pasted text or `.md`/`.txt` upload (`POST /api/ingest/text`), and single-page scraping (`POST /api/ingest/url`). Both feed one pipeline, `src/lib/ingest/pipeline.ts` `ingestDocument`:
- chunk the content (`chunk.ts` `chunkText`, ≤1000 chars with 150 overlap);
- dedupe on a sha256 of the content;
- add a row to the Supabase `documents` table;
- upsert to Pinecone, which embeds `chunk_text` itself.

Chat (`src/lib/rag/pinecone-retriever.ts` → `answer.ts`) returns the top 5 chunks by score. The app is a plain-language tech helper for older adults.

Today the only cleaning is:
- the scraper's HTML → text pass in `sources/url.ts`, which strips nav, buttons and breadcrumbs;
- whitespace tidying inside `chunkText`.

Uploaded markdown goes in with its noise intact: front matter, link URLs, image syntax, HTML comments, zero-width and odd Unicode characters, repeated paragraphs. A chunk also doesn't say which page or section it came from. Both noisy chunks and context-free chunks hurt embedding quality and what the chat model sees.

**Goal:** a preprocessing stage inside the shared pipeline that cleans every document, splits it at section boundaries, and adds a context line to each chunk. It also rejects documents that are basically empty, reports what it did, and has a no-save preview mode. Every current and future ingestion method gets it automatically.

## Decisions
**The user's decisions:**
1. **Section-aware chunks with context.** Split at markdown headings first, then by size. Each `chunk_text` starts with `Doc title > Heading > Subheading`, a blank line, then the body.
2. **Supabase keeps the cleaned text.** `/documents/<id>` therefore shows what was indexed. The content hash is computed on the cleaned text.
3. **Quality gate.** Reject with a 400 when fewer than **100 letters or digits** remain after cleaning. Tiny sections get merged into a neighbour rather than stored alone.
4. **Visibility.** Ready and duplicate responses gain an additive `cleaning` report, and there is a **preview mode**: same routes with `?preview=1`. It runs parsing, cleaning and chunking, saves nothing, and has a Preview button on `/ingest`.

**My calls (correct at review):**
- Cleaning runs in the **pipeline**, not the sources, so both methods and any future one get it.
- `sources/url.ts`, `sources/text.ts`, `chunkText`, the retriever, the `/documents` page and the DB schema are **unchanged**, so no migration is needed.
- Unicode uses **NFC, not NFKC**. NFKC would turn `x²` into `x2` and rewrite full-width code.
- Markdown links `[text](url)` become `text`. If the text is empty or is itself the URL, the URL stays. Images `![alt](src)` become `alt`, or are dropped when there's no alt text. Emphasis markers stay. Code fences are never touched by any step.
- **Hashing changes from raw to cleaned text.** Rows from before this change won't dedupe against new submissions of the same doc. The table was empty after the US6 cleanup, so this is acceptable and will be noted in the PR.
- The context-line prefix is capped at about 200 chars. The chunk body size is reduced to fit, so the whole `chunk_text` stays ≤ 1000 chars.
- **"Code" is protected:** ```` ``` ```` and `~~~` fences (with or without a language tag), inline code spans between backticks, and indented code blocks (4+ spaces or a tab after a blank line, outside lists). No step changes their layout or wording.
  - The one exception, added during implementation: invisible and control characters (zero-width spaces, BOMs, soft hyphens) and CRLF line endings are fixed everywhere, code included. They silently break commands people copy.
- **HTML tag stripping uses a list of known tag names** (`div span p br a img b i em strong u sup sub small font center table tr td th tbody thead ul ol li section article details summary kbd`). Text such as `<your-password>` or `<user>@<host>` is kept.
- **List items and numbered steps are never treated as boilerplate.**
  - Rule (a) matches only lines with no list marker.
  - Rule (d) ignores lines that start with `-`, `*`, `+` or `1.`.
  - Duplicate *paragraphs* (rule c) that are a full list block still dedupe.
  - Repeated steps like "1. Open Settings." in the iPhone and Android sections stay.
- **Preview never fails the quality gate.** It returns 200 with `wouldReject: { reason }` next to the cleaned content and chunks, so you can see why a document would be emptied. Only a real ingest returns the 400.

## Goals / non-goals / anti-goals
- **Goals:** deterministic, pure, unit-tested cleaning steps; section context in every chunk; the quality gate; the cleaning report; preview mode in the API and the UI.
- **Non-goals:**
  - near-duplicate detection across documents (would need vector queries);
  - PII redaction;
  - language detection;
  - LLM-based cleanup or summarising;
  - re-processing documents already ingested;
  - PDF.
- **Anti-goals:**
  - changing the US6 API contract beyond additive fields;
  - mangling code blocks or commands, which matter for a tech helper;
  - dropping real content as "boilerplate";
  - tests that call live services.

## Architecture
New files go in `src/lib/ingest/preprocess/`. Each one has a sibling `*.test.ts`, with `// @vitest-environment node` as in US6.

| File | Responsibility |
| --- | --- |
| `fences.ts` | `mapOutsideCode(text, fn)`: splits off fenced blocks, indented code blocks and inline code spans, applies `fn` only to the prose segments, and passes all code through byte-for-byte. Every step below uses it. |
| `normalize.ts` | `normalizeText(text)`: NFC; CRLF/CR → LF; remove BOM, zero-width characters (U+200B–U+200D, U+2060, U+FEFF), soft hyphens (U+00AD) and control characters other than `\t` and `\n`; ligatures `ﬁ ﬂ ﬀ ﬃ ﬄ` → letters; Unicode spaces (U+00A0, U+2000–U+200A, U+202F, U+205F, U+3000) → space. Outside fences it also collapses runs of spaces, trims line ends, and squeezes 3+ newlines to 2. |
| `markdown.ts` | `stripMarkdownNoise(text)`: leading YAML front matter (`---…---` at the very start), HTML comments, the link and image rewrite above, reference-link definition lines (`[id]: http…`), and inline HTML tags outside fences. Tag text is kept; `<br>` becomes a newline. |
| `boilerplate.ts` | `removeBoilerplate(text)` returns `{ text, linesRemoved, duplicatesRemoved }`. **(a)** Drops lines that *entirely* match a known UI phrase, case-insensitive, ignoring trailing `:.!`, e.g. `copy`, `copy code`, `copied!`, `skip to (main )?content`, `edit this page`, `edit on github`, `was this (page\|article) helpful?`, `on this page`, `table of contents`, `back to top`, `advertisement`, `loading…`, `share`, `print`. **(b)** Drops cookie-consent paragraphs: under 400 chars, mentioning `cookie(s)` together with `accept\|consent\|privacy`. **(c)** Removes exact duplicate paragraphs of ≥ 40 meaningful chars after their first occurrence. **(d)** A non-heading line of ≤ 80 chars that appears ≥ 3 times keeps only its first occurrence. Headings and fenced code are never removed. |
| `quality.ts` | `meaningfulLength(text)` counts `\p{L}\|\p{N}`. Also exports `MIN_DOCUMENT_CHARS = 100` and `MIN_SECTION_CHARS = 200`. |
| `index.ts` | `preprocessDocument(raw)` → `{ document: RawDocument, report: CleaningReport }`. It runs normalize → markdown → boilerplate → normalize again, and cleans the title: normalize, collapse whitespace, keep ≤ 200 chars. |
| `src/lib/ingest/sections.ts` | `splitSections(markdown)` → `{ headingPath: string[]; body: string }[]`. It keeps a heading stack from ATX headings `#`–`######`, ignoring `#` lines inside fences. Text before the first heading gets `headingPath: []`. Heading lines are not repeated in `body`. |
| `src/lib/ingest/chunk.ts` | Adds `chunkDocument(content, title, options)` → `{ chunks: string[]; sectionsMerged: number }`. **`chunkText` is unchanged.** |

**How `chunkDocument` works:**
1. Run `splitSections`.
2. Merge any section with meaningful length below `MIN_SECTION_CHARS` into the next section, or into the previous one if it's the last. The merged section's heading is kept as a `## Heading` line inside the body. Merging stops when the combined body would exceed `maxChars`.
3. Each section gets the prefix `[title, ...headingPath]`. A leading heading that equals the title (case-insensitive) is skipped, and the parts are joined with ` > `.
4. Split each body with `chunkText(body, { maxChars: maxChars - prefix.length - 2, overlap })`.
5. Each chunk becomes `${prefix}\n\n${piece}`.

**`CleaningReport`** is added to `types.ts`:
```
{ originalChars, cleanedChars, boilerplateLinesRemoved, duplicateBlocksRemoved, sectionsMerged }
```

**Pipeline changes (`pipeline.ts`)**
- A new pure function, `prepareDocument(raw, chunkOptions)`, returns `{ document, report, chunks }`:
  - It runs `preprocessDocument`.
  - If the cleaned content is empty, it throws the **existing** `"Document has no text content to ingest"` error.
  - If `meaningfulLength < 100`, it throws a `validation` error: `"Document has too little readable text after cleaning (N characters; at least 100 needed)"`.
  - Otherwise it runs `chunkDocument(document.content, document.title, …)`.
- `ingestDocument`:
  - calls `prepareDocument`;
  - hashes and stores `document.content` and `document.title`;
  - builds records from the prepared chunks;
  - keeps everything else (dedupe, retry, stale-chunk cleanup, `markFailed`) unchanged;
  - adds `cleaning: report` to the `ready` and `duplicate` results.
- `prepareDocument` returns the gate outcome rather than throwing on its own. `ingestDocument` throws the validation error when the gate fails.
- New: `previewDocument(raw, chunkOptions)` → `{ status: "preview", title, cleanedContent, chunks: string[], cleaning, wouldReject?: { reason } }`. It needs no deps and makes no I/O.
- `types.ts`: add `cleaning` to both `IngestResult` variants, plus a `PreviewResult`.
- `http.ts`: widen `ingestResponse` to `IngestResult | PreviewResult`. Preview returns **200**, `ready` stays 201 and `duplicate` stays 200.

**Routes:** in `src/app/api/ingest/{text,url}/route.ts`, after auth, size check and parsing exactly as now:
```
new URL(request.url).searchParams.get("preview") === "1" ? previewDocument(raw) : ingestDocument(raw, createIngestDeps())
```
Preview still requires the bearer key, because the URL path fetches remote pages.

**UI (`src/app/ingest/ingest-forms.tsx`):**
- Each form gets a secondary **Preview** button that posts to the same endpoint with `?preview=1`.
- The outcome view gains:
  - for preview: the title, the cleaning summary, and a numbered list of the chunks in `<pre className="whitespace-pre-wrap">`. When `wouldReject` is set, a warning line ("This would be rejected: …") appears above the cleaned text;
  - for ingest: a one-line cleaning summary under the existing "Ingested … as N chunks", e.g. "Cleaned: removed 12 boilerplate lines, 2 duplicate blocks; merged 3 small sections".
- Existing labels and roles (`status` / `alert`) stay as they are.

**Docs:** add a "Cleaning and preprocessing" subsection to the README's Knowledge base ingestion section. It covers the steps, the chunk format with its prefix, the quality gate and its 400, the `cleaning` field, and `?preview=1` with a curl example. Also update the chunk-format line.

## Critical files
- **New:** `src/lib/ingest/preprocess/{fences,normalize,markdown,boilerplate,quality,index}.ts`, `src/lib/ingest/sections.ts`.
- **Modified:** `src/lib/ingest/{chunk,pipeline,types,http}.ts`, both `src/app/api/ingest/*/route.ts`, `src/app/ingest/ingest-forms.tsx`, `README.md`, and the tests named above.
- **Reused, not changed:** `chunkText` (`chunk.ts`), `contentHash` (`hash.ts`), `IngestError` (`errors.ts`), `assertIngestAuthorized` (`auth.ts`), the sources, `createIngestDeps` (`deps.ts`), and the retriever.

## Verification
1. `npm test` passes: all existing tests plus the new ones, with no network access. `npm run lint` and `npm run build` are clean.
2. Live E2E with `.env.local` (`npm run dev`, bearer key):
   1. Preview a messy markdown file through `/api/ingest/text?preview=1`, using `-F file=@fixture.md`. Check that the front matter, "Copy" lines and cookie banner are gone, the code fence is intact, and the chunks start with `Title > Section`.
   2. Preview `https://nextjs.org/docs/app/getting-started/route-handlers` the same way.
   3. Ingest both; the responses are 201 with `cleaning`. Confirm in Pinecone that `chunk_text` has the prefix, and in Supabase that `content` is the cleaned text.
   4. Open `/documents/<id>`.
   5. Ask chat a question and check that it cites the doc.
   6. Submit `{"title":"x","content":"Copy\nCopy code"}` → 400 for too little readable text.
   7. Use both Preview buttons on `/ingest` in the browser.
3. **Cleanup:** delete the test rows from Supabase and the test chunks from Pinecone (the index is shared with the teammate).
4. Push and open a PR with no attribution footer, on request.
