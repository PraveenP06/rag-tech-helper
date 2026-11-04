// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertIngestAuthorized } from "./auth";

const req = (authorization?: string) =>
  new Request("http://localhost/api/ingest/text", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("assertIngestAuthorized", () => {
  it("accepts the configured key as a bearer token", () => {
    expect(() => assertIngestAuthorized(req("Bearer s3cret"), "s3cret")).not.toThrow();
    expect(() => assertIngestAuthorized(req("bearer   s3cret "), "s3cret")).not.toThrow();
  });

  it("rejects a missing, malformed or wrong key with 'unauthorized'", () => {
    for (const header of [undefined, "s3cret", "Basic s3cret", "Bearer", "Bearer wrong", "Bearer s3cret2"]) {
      expect(() => assertIngestAuthorized(req(header), "s3cret")).toThrow(
        expect.objectContaining({ kind: "unauthorized" }),
      );
    }
  });

  it("fails closed when no key is configured on the server", () => {
    for (const configured of [undefined, "", "   "]) {
      expect(() => assertIngestAuthorized(req("Bearer anything"), configured)).toThrow(
        expect.objectContaining({ kind: "unavailable", message: expect.stringMatching(/INGEST_API_KEY/) }),
      );
    }
  });
});
