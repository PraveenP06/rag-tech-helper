import { describe, expect, it, vi } from "vitest";

import type { UsageLogInput, UsageLogger } from "../../../lib/admin/usage-logger";
import { createPostHandler } from "./route";

const requestFor = (body: unknown): Request =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/chat", () => {
  it("rejects invalid questions", async () => {
    const handler = createPostHandler({
      retrieve: vi.fn(),
      generate: vi.fn(),
      minScore: 0.5,
    });

    const response = await handler(requestFor({ question: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid question." });
  });

  it("returns a generic failure response when a dependency fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createPostHandler({
      retrieve: vi.fn(async () => {
        throw new Error("Pinecone failed");
      }),
      generate: vi.fn(),
      minScore: 0.5,
    });

    const response = await handler(requestFor({ question: "How do I call?" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to answer your question right now.",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("passes the optional conversation dependency through to answering", async () => {
    const converse = vi.fn(async (): Promise<string | undefined> => "You’re welcome!");
    const handler = createPostHandler({
      retrieve: vi.fn(async () => []),
      generate: vi.fn(),
      converse,
      minScore: 0.5,
    });

    const response = await handler(requestFor({ question: "thanks!" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ answer: "You’re welcome!" });
    expect(converse).toHaveBeenCalledWith("thanks!");
  });
});

describe("POST /api/chat usage logging", () => {
  const chunk = {
    id: "doc-1#0",
    score: 0.9,
    text: "Press the green button to answer a call.",
    documentId: "doc-1",
    title: "Calling guide",
    sourceUrl: "https://example.com/calling",
  };

  it("logs successful requests with latency and grounded status", async () => {
    let loggedEntry: UsageLogInput | undefined;
    const logUsage = vi.fn<UsageLogger>(async (entry) => {
      loggedEntry = entry;
    });
    const handler = createPostHandler({
      retrieve: vi.fn(async () => [chunk]),
      generate: vi.fn(async () => "Press the green button."),
      minScore: 0.5,
      logUsage,
    });

    const response = await handler(requestFor({ question: "How do I answer a call?" }));

    expect(response.status).toBe(200);
    expect(logUsage).toHaveBeenCalledOnce();
    expect(loggedEntry).toMatchObject({ status: "ok", grounded: true });
    expect(loggedEntry?.latencyMs ?? -1).toBeGreaterThanOrEqual(0);
  });

  it("logs failed requests as errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let loggedEntry: UsageLogInput | undefined;
    const logUsage = vi.fn<UsageLogger>(async (entry) => {
      loggedEntry = entry;
    });
    const handler = createPostHandler({
      retrieve: vi.fn(async () => {
        throw new Error("Pinecone failed");
      }),
      generate: vi.fn(),
      minScore: 0.5,
      logUsage,
    });

    const response = await handler(requestFor({ question: "How do I call?" }));

    expect(response.status).toBe(500);
    expect(logUsage).toHaveBeenCalledOnce();
    expect(loggedEntry).toMatchObject({ status: "error", grounded: null });
    errorSpy.mockRestore();
  });

  it("still answers when the logger throws", async () => {
    const logUsage = vi.fn<UsageLogger>(async () => {
      throw new Error("Supabase down");
    });
    const handler = createPostHandler({
      retrieve: vi.fn(async () => [chunk]),
      generate: vi.fn(async () => "Press the green button."),
      minScore: 0.5,
      logUsage,
    });

    const response = await handler(requestFor({ question: "How do I answer a call?" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ grounded: true });
  });
});
