// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getEnv } from "./env";

const valid = {
  PINECONE_API_KEY: "p-key",
  PINECONE_INDEX: "tech-helper",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "s-key",
};

describe("getEnv", () => {
  it("returns parsed values", () => {
    expect(getEnv(valid)).toEqual(valid);
  });

  it("does not need the Gemini key (Pinecone embeds ingested text itself)", () => {
    expect(() => getEnv(valid)).not.toThrow();
  });

  it("accepts NEXT_PUBLIC_SUPABASE_URL, Supabase's standard Next.js name, as the URL", () => {
    const { SUPABASE_URL, ...rest } = valid;
    expect(getEnv({ ...rest, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL }).SUPABASE_URL).toBe(SUPABASE_URL);
  });

  it("prefers SUPABASE_URL when both are set", () => {
    expect(getEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }).SUPABASE_URL).toBe(
      valid.SUPABASE_URL,
    );
  });

  it("names every missing variable in the error", () => {
    expect(() => getEnv({ PINECONE_INDEX: "x" })).toThrow(
      /PINECONE_API_KEY[\s\S]*SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("says which variables are required when they are absent", () => {
    expect(() => getEnv({})).toThrow("PINECONE_API_KEY: is required");
  });

  it("treats empty strings as missing", () => {
    expect(() => getEnv({ ...valid, PINECONE_API_KEY: "" })).toThrow(/PINECONE_API_KEY/);
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() => getEnv({ ...valid, SUPABASE_URL: "not a url" })).toThrow(/SUPABASE_URL/);
  });
});
