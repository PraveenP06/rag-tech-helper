import { describe, expect, it, vi } from "vitest";

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
});
