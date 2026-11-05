// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { extractReadableText, fromUrl, isPublicAddress, type UrlSourceOptions } from "./url";

const html = `<!doctype html>
<html><head><title>Routing Fundamentals | Docs</title>
<style>.x{color:red}</style><script>window.track = 1</script></head>
<body>
  <header><a href="/">Logo</a> Sign in</header>
  <nav><ul><li>Home</li><li>Pricing</li></ul></nav>
  <main>
    <h1>Routing</h1>
    <p>The app   router uses <code>folders</code> to define routes.</p>
    <ul><li>Pages are UI</li><li>Layouts are shared</li></ul>
    <pre><code>export default function Page() {
  return null
}</code></pre>
  </main>
  <aside>Related links</aside>
  <footer>© 2026 Example Inc</footer>
</body></html>`;

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function options(fetchImpl: UrlSourceOptions["fetchImpl"], overrides: Partial<UrlSourceOptions> = {}) {
  return {
    fetchImpl,
    resolveHost: async () => ["93.184.216.34"],
    ...overrides,
  } satisfies UrlSourceOptions;
}

describe("extractReadableText", () => {
  it("keeps main content and drops navigation, scripts and footers", () => {
    const { title, text } = extractReadableText(html);
    expect(title).toBe("Routing Fundamentals | Docs");
    expect(text).toContain("# Routing");
    expect(text).toContain("The app router uses folders to define routes.");
    expect(text).toContain("- Pages are UI");
    expect(text).toContain("export default function Page() {\n  return null\n}");
    for (const junk of ["Logo", "Pricing", "window.track", "color:red", "Related links", "2026 Example"]) {
      expect(text).not.toContain(junk);
    }
  });

  it("drops unlabeled breadcrumb rows made only of links (nextjs.org docs markup)", () => {
    const { text } = extractReadableText(`<main><article>
      <div class="flex items-center gap-1.5 text-sm"><a href="/docs/app">App Router</a><svg viewBox="0 0 16 16"><path d="m5.5 1.94"></path></svg><a href="/docs/app/getting-started">Getting Started</a></div>
      <h1>Route Handlers</h1>
      <p>Route Handlers let you create custom request handlers.</p>
    </article></main>`);
    expect(text).not.toMatch(/App Router|Getting Started/);
    expect(text.startsWith("# Route Handlers")).toBe(true);
  });

  it("drops elements labelled as breadcrumbs", () => {
    const { text } = extractReadableText(`<main>
      <ol class="Breadcrumbs_list"><li><a href="/">Home</a></li><li>Guides</li></ol>
      <div aria-label="Breadcrumb">Docs / Guides</div>
      <p>Actual content.</p>
    </main>`);
    expect(text).toBe("Actual content.");
  });

  it("keeps text from running together where an icon or other removed element sat between words", () => {
    const { text } = extractReadableText(
      "<main><p>Press<svg><path/></svg>Save<button>Copy</button>then<script>x</script>close.</p></main>",
    );
    expect(text).toBe("Press Save then close.");
  });

  it("keeps prose with links and lists that are mostly text", () => {
    const { text } = extractReadableText(`<main>
      <p>Read the <a href="/a">routing guide</a> and the <a href="/b">layouts guide</a> before you start building pages.</p>
      <ul><li><a href="/x">Pages</a> are UI that is unique to a route.</li><li><a href="/y">Layouts</a> are UI shared between routes.</li></ul>
    </main>`);
    expect(text).toContain("Read the routing guide and the layouts guide before you start building pages.");
    expect(text).toContain("- Pages are UI that is unique to a route.");
    expect(text).toContain("- Layouts are UI shared between routes.");
  });

  it("drops short link-only lists such as 'related pages' blocks", () => {
    const { text } = extractReadableText(`<main>
      <p>Main explanation of the feature goes here.</p>
      <ul><li><a href="/1">Caching</a></li><li><a href="/2">Revalidating</a></li><li><a href="/3">Error handling</a></li></ul>
    </main>`);
    expect(text).toBe("Main explanation of the feature goes here.");
  });

  it("falls back to the first h1 for the title and to body when there is no main", () => {
    const { title, text } = extractReadableText(
      "<html><body><h1>Install</h1><p>Run npm install.</p></body></html>",
    );
    expect(title).toBe("Install");
    expect(text).toContain("Run npm install.");
  });
});

describe("isPublicAddress", () => {
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700::1111"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("fromUrl", () => {
  it("fetches a page and returns a url document", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const doc = await fromUrl({ url: "https://example.com/docs/routing" }, options(fetchImpl));
    expect(doc).toMatchObject({
      sourceType: "url",
      sourceRef: "https://example.com/docs/routing",
      title: "Routing Fundamentals | Docs",
    });
    expect(doc.content).toContain("folders to define routes");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/docs/routing",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("follows redirects and records the final URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/new" } }))
      .mockResolvedValueOnce(htmlResponse(html));
    const doc = await fromUrl({ url: "https://example.com/old" }, options(fetchImpl));
    expect(doc.sourceRef).toBe("https://example.com/new");
  });

  it("re-checks every redirect hop against the private-address rules", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
      );
    await expect(fromUrl({ url: "https://example.com" }, options(fetchImpl))).rejects.toMatchObject({
      kind: "validation",
      message: expect.stringMatching(/private|local/i),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "/loop" } }),
    );
    await expect(fromUrl({ url: "https://example.com" }, options(fetchImpl))).rejects.toThrow(
      /redirects/i,
    );
  });

  it.each(["ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)", "not a url"])(
    "rejects %s",
    async (url) => {
      const fetchImpl = vi.fn();
      await expect(fromUrl({ url }, options(fetchImpl))).rejects.toMatchObject({ kind: "validation" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(["http://localhost:3000", "http://app.localhost", "http://192.168.0.10/", "http://[::1]/"])(
    "rejects local address %s without fetching",
    async (url) => {
      const fetchImpl = vi.fn();
      await expect(fromUrl({ url }, options(fetchImpl))).rejects.toMatchObject({ kind: "validation" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("rejects hostnames that resolve to a private address", async () => {
    const fetchImpl = vi.fn();
    const opts = options(fetchImpl, { resolveHost: async () => ["93.184.216.34", "10.0.0.7"] });
    await expect(fromUrl({ url: "https://internal.example.com" }, opts)).rejects.toThrow(/private/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains a missing url field", async () => {
    await expect(fromUrl({}, options(vi.fn()))).rejects.toThrow("URL is required");
  });

  it("reports non-2xx responses as upstream errors", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("nope", { status: 404 }));
    await expect(fromUrl({ url: "https://example.com/x" }, options(fetchImpl))).rejects.toMatchObject({
      kind: "upstream",
      message: expect.stringContaining("404"),
    });
  });

  it("rejects non-HTML content but accepts plain text and markdown as-is", async () => {
    const pdf = vi.fn(
      async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(fromUrl({ url: "https://example.com/a.pdf" }, options(pdf))).rejects.toMatchObject({
      kind: "validation",
    });

    const md = vi.fn(
      async () =>
        new Response("# Readme\n\nHello", { headers: { "content-type": "text/markdown" } }),
    );
    await expect(
      fromUrl({ url: "https://raw.example.com/README.md" }, options(md)),
    ).resolves.toMatchObject({ title: "Readme", content: "# Readme\n\nHello" });
  });

  it("times out slow pages", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(
      fromUrl({ url: "https://slow.example.com" }, options(fetchImpl, { timeoutMs: 20 })),
    ).rejects.toMatchObject({ kind: "upstream", message: expect.stringMatching(/timed out/i) });
  });

  it("rejects pages over the size limit, declared or streamed", async () => {
    const declared = vi.fn(async () =>
      htmlResponse("<p>hi</p>", { headers: { "content-type": "text/html", "content-length": "999999" } }),
    );
    await expect(
      fromUrl({ url: "https://example.com" }, options(declared, { maxBytes: 1000 })),
    ).rejects.toMatchObject({ kind: "too_large" });

    const streamed = vi.fn(async () => htmlResponse(`<p>${"a".repeat(5000)}</p>`));
    await expect(
      fromUrl({ url: "https://example.com" }, options(streamed, { maxBytes: 1000 })),
    ).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects pages with no readable text", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<html><body><script>x()</script></body></html>"));
    await expect(fromUrl({ url: "https://example.com" }, options(fetchImpl))).rejects.toThrow(
      /no readable text/i,
    );
  });
});
