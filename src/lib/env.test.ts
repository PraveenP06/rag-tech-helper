// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getEnv } from "./env";

const valid = {
  GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
  PINECONE_API_KEY: "p-key",
  PINECONE_INDEX: "tech-helper",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "s-key",
};

describe("getEnv", () => {
  it("returns parsed values and defaults the namespace", () => {
    const env = getEnv(valid);
    expect(env.PINECONE_INDEX).toBe("tech-helper");
    expect(env.PINECONE_NAMESPACE).toBe("default");
  });

  it("keeps an explicit namespace", () => {
    expect(getEnv({ ...valid, PINECONE_NAMESPACE: "docs" }).PINECONE_NAMESPACE).toBe("docs");
  });

  it("names every missing variable in the error", () => {
    expect(() => getEnv({ PINECONE_INDEX: "x" })).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY[\s\S]*PINECONE_API_KEY[\s\S]*SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY/,
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
