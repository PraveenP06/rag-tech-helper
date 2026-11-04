// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const embedMany = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ embedMany }));

import { createEmbedder } from "./embed";

beforeEach(() => embedMany.mockReset());

describe("createEmbedder", () => {
  it("embeds all texts as retrieval documents at 768 dimensions", async () => {
    embedMany.mockResolvedValue({ embeddings: [[0.1], [0.2]] });
    const model = { fake: "model" };
    const embed = createEmbedder(model as never);

    await expect(embed(["a", "b"])).resolves.toEqual([[0.1], [0.2]]);
    expect(embedMany).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        values: ["a", "b"],
        providerOptions: {
          google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" },
        },
      }),
    );
  });

  it("skips the API call for an empty list", async () => {
    await expect(createEmbedder({} as never)([])).resolves.toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });
});
