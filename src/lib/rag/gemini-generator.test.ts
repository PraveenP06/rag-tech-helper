import { beforeEach, describe, expect, it, vi } from "vitest";

const googleMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  model: vi.fn(),
  createGoogle: vi.fn(),
  modelValue: { id: "mock-model" },
}));

vi.mock("ai", () => ({ generateText: googleMocks.generateText }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: googleMocks.createGoogle }));

import { generateWithGemini } from "./gemini-generator";

describe("generateWithGemini", () => {
  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    googleMocks.generateText.mockReset();
    googleMocks.model.mockReset();
    googleMocks.createGoogle.mockReset();
    googleMocks.model.mockReturnValue(googleMocks.modelValue);
    googleMocks.createGoogle.mockReturnValue(googleMocks.model);
  });

  it("uses the primary Gemini model through the AI SDK", async () => {
    googleMocks.generateText.mockResolvedValue({ text: "1. Open Settings." });

    await expect(
      generateWithGemini({
        system: "Stay grounded.",
        context: "Open Settings.",
        question: "How do I open settings?",
      }),
    ).resolves.toBe("1. Open Settings.");

    expect(googleMocks.createGoogle).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(googleMocks.model).toHaveBeenCalledTimes(1);
    expect(googleMocks.model).toHaveBeenCalledWith("gemini-3.1-flash-lite");
    expect(googleMocks.generateText).toHaveBeenCalledWith({
      model: googleMocks.modelValue,
      system: "Stay grounded.",
      prompt: "Context:\nOpen Settings.\n\nQuestion:\nHow do I open settings?",
      maxRetries: 1,
    });
  });

  it("uses the next model after transient 503 errors, but not non-transient errors", async () => {
    googleMocks.generateText
      .mockRejectedValueOnce(Object.assign(new Error("high demand"), { status: 503 }))
      .mockResolvedValueOnce({ text: "Try again shortly." });

    await expect(
      generateWithGemini({ system: "system", context: "context", question: "question" }),
    ).resolves.toBe("Try again shortly.");

    expect(googleMocks.model).toHaveBeenNthCalledWith(1, "gemini-3.1-flash-lite");
    expect(googleMocks.model).toHaveBeenNthCalledWith(2, "gemini-3.6-flash");
  });

  it("tries GEMINI_MODEL before the default fallback chain", async () => {
    process.env.GEMINI_MODEL = "gemini-custom";
    googleMocks.generateText
      .mockRejectedValueOnce(Object.assign(new Error("other side closed"), { cause: "socket" }))
      .mockResolvedValueOnce({ text: "Fallback answer." });

    await expect(
      generateWithGemini({ system: "system", context: "context", question: "question" }),
    ).resolves.toBe("Fallback answer.");

    expect(googleMocks.model.mock.calls.map(([model]) => model)).toEqual([
      "gemini-custom",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("does not fall back after an authentication error", async () => {
    googleMocks.generateText.mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));

    await expect(
      generateWithGemini({ system: "system", context: "context", question: "question" }),
    ).rejects.toThrow("unauthorized");

    expect(googleMocks.model).toHaveBeenCalledTimes(1);
    expect(googleMocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the Google API key is missing", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    await expect(
      generateWithGemini({ system: "system", context: "context", question: "question" }),
    ).rejects.toThrow("GOOGLE_GENERATIVE_AI_API_KEY is required");

    expect(googleMocks.model).not.toHaveBeenCalled();
    expect(googleMocks.generateText).not.toHaveBeenCalled();
  });

  it("throws a generic error when every model fails", async () => {
    googleMocks.generateText.mockRejectedValue(Object.assign(new Error("high demand"), { status: 503 }));

    await expect(
      generateWithGemini({ system: "system", context: "context", question: "question" }),
    ).rejects.toThrow("Unable to generate an answer with Gemini.");

    expect(googleMocks.model).toHaveBeenCalledTimes(2);
  });
});
