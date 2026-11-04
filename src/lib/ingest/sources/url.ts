import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { IngestError, errorMessage } from "../errors";
import type { RawDocument } from "../types";
import { firstHeading } from "./text";

export const MAX_PAGE_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "rag-tech-helper/0.1 (knowledge-base ingestion)";

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);

export interface UrlSourceOptions {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Returns every IP address the hostname resolves to. Injected in tests. */
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
}

const inputSchema = z.object({ url: z.string().trim().min(1, "URL is required") });

// ---------------------------------------------------------------------------
// Address safety: never let a submitted URL reach localhost or a private network.
// (DNS can still change between this check and the fetch; acceptable for a dev tool.)
// ---------------------------------------------------------------------------

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPublicV4(ip: string): boolean {
  const addr = v4ToInt(ip);
  return BLOCKED_V4.every(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (addr & mask) >>> 0 !== (v4ToInt(base) & mask) >>> 0;
  });
}

/** IPv4-mapped IPv6 (`::ffff:1.2.3.4` or `::ffff:102:304`) → dotted IPv4, else undefined. */
function mappedV4(ip: string): string | undefined {
  const m = ip.match(/^::ffff:(.+)$/);
  if (!m) return undefined;
  if (isIP(m[1]) === 4) return m[1];
  const hex = m[1].match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return undefined;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  const version = isIP(ip);
  if (version === 4) return isPublicV4(ip);
  if (version !== 6) return false;

  const v4 = mappedV4(ip);
  if (v4) return isPublicV4(v4);
  if (ip === "::" || ip === "::1") return false;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true });
  return results.map((r) => r.address);
}

async function assertFetchable(url: URL, resolveHost: (h: string) => Promise<string[]>) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("Only http and https URLs can be ingested", "validation");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new IngestError("Refusing to fetch a local address", "validation");
  }
  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new IngestError("Refusing to fetch a private or local address", "validation");
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(host);
  } catch (err) {
    throw new IngestError(`Could not resolve host "${host}": ${errorMessage(err)}`, "upstream");
  }
  if (addresses.length === 0) {
    throw new IngestError(`Could not resolve host "${host}"`, "upstream");
  }
  if (!addresses.every(isPublicAddress)) {
    throw new IngestError(`Host "${host}" resolves to a private or local address`, "validation");
  }
}

// ---------------------------------------------------------------------------
// HTML → readable text
// ---------------------------------------------------------------------------

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
}

const REMOVE = [
  "script", "style", "noscript", "template", "svg", "canvas", "iframe", "object",
  "nav", "aside", "form", "button", "dialog",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[role=search]",
  "[hidden]", "[aria-hidden=true]",
].join(", ");

const BLOCKS = new Set([
  "address", "article", "blockquote", "body", "dd", "details", "div", "dl", "dt", "figcaption",
  "figure", "hr", "main", "ol", "p", "section", "summary", "table", "tbody", "thead", "tr", "ul",
]);

function textContent(node: DomNode): string {
  if (node.type === "text") return node.data ?? "";
  return (node.children ?? []).map(textContent).join("");
}

function render(node: DomNode, out: string[]): void {
  if (node.type === "text") {
    out.push((node.data ?? "").replace(/\s+/g, " "));
    return;
  }
  if (node.type !== "tag" && node.type !== "root") return;

  const name = node.name ?? "";
  const children = () => (node.children ?? []).forEach((child) => render(child, out));

  if (name === "br") return void out.push("\n");
  if (name === "pre") {
    out.push(`\n\n\`\`\`\n${textContent(node).replace(/^\n+|\s+$/g, "")}\n\`\`\`\n\n`);
    return;
  }
  const heading = name.match(/^h([1-6])$/);
  if (heading) {
    const text = textContent(node).replace(/\s+/g, " ").trim();
    if (text) out.push(`\n\n${"#".repeat(Number(heading[1]))} ${text}\n\n`);
    return;
  }
  if (name === "li") {
    out.push("\n- ");
    children();
    out.push("\n");
    return;
  }
  if (name === "td" || name === "th") {
    children();
    out.push(" ");
    return;
  }

  const block = BLOCKS.has(name);
  if (block) out.push("\n\n");
  children();
  if (block) out.push("\n\n");
}

/** Trims and collapses whitespace line by line, leaving fenced code blocks untouched. */
function tidy(raw: string): string {
  let inFence = false;
  const lines = raw.split("\n").map((line) => {
    if (line.trim() === "```") {
      inFence = !inFence;
      return "```";
    }
    return inFence ? line : line.replace(/[ \t]+/g, " ").trim();
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractReadableText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const docTitle = $("title").first().text().replace(/\s+/g, " ").trim();

  $(REMOVE).remove();
  // Site-wide headers/footers are noise; ones inside the article (bylines, titles) are kept.
  $("header, footer")
    .filter((_, el) => $(el).closest("main, article").length === 0)
    .remove();

  const candidate = ["main", "article", "[role=main]", "body"]
    .map((selector) => $(selector).first())
    .find((el) => el.length > 0);
  const rootNode = (candidate ?? $.root()).get(0) as unknown as DomNode;

  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const out: string[] = [];
  render(rootNode, out);
  return { title: docTitle || h1, text: tidy(out.join("")) };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IngestError(`Page is too large (limit ${maxBytes} bytes)`, "too_large");
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new IngestError(`Page is too large (limit ${maxBytes} bytes)`, "too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseUrl(input: string): URL {
  try {
    return new URL(input);
  } catch {
    throw new IngestError(`"${input}" is not a valid URL`, "validation");
  }
}

function fallbackTitle(url: URL): string {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  return lastSegment ? decodeURIComponent(lastSegment) : url.hostname;
}

/** Ingestion method 2: scrape the main text of a single web page. */
export async function fromUrl(input: unknown, options: UrlSourceOptions = {}): Promise<RawDocument> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new IngestError(parsed.error.issues.map((i) => i.message).join("; "), "validation");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_PAGE_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);

  let url = parseUrl(parsed.data.url);
  let res: Response | undefined;

  try {
    // Follow redirects by hand so every hop goes through the address checks.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertFetchable(url, resolveHost);
      const response = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,text/markdown;q=0.9",
        },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => {});
        url = new URL(location, url);
        continue;
      }
      res = response;
      break;
    }
    if (!res) throw new IngestError(`Too many redirects (limit ${MAX_REDIRECTS})`, "upstream");

    if (!res.ok) {
      throw new IngestError(`Fetching page failed: HTTP ${res.status}`, "upstream");
    }

    const mime = (res.headers.get("content-type") ?? "text/html").split(";")[0].trim().toLowerCase();
    const isHtml = HTML_TYPES.has(mime);
    if (!isHtml && !TEXT_TYPES.has(mime)) {
      throw new IngestError(
        `Unsupported content type "${mime}"; expected an HTML page or plain text`,
        "validation",
      );
    }

    const body = await readCapped(res, maxBytes);
    const { title, text } = isHtml
      ? extractReadableText(body)
      : { title: firstHeading(body) ?? "", text: body.trim() };

    if (!text) throw new IngestError("No readable text found on the page", "validation");
    return {
      sourceType: "url",
      sourceRef: url.toString(),
      title: (title || fallbackTitle(url)).slice(0, 200),
      content: text,
    };
  } catch (err) {
    if (err instanceof IngestError) throw err;
    if (signal.aborted) {
      throw new IngestError(`Fetching page timed out after ${timeoutMs}ms`, "upstream", { cause: err });
    }
    throw new IngestError(`Fetching page failed: ${errorMessage(err)}`, "upstream", { cause: err });
  }
}
