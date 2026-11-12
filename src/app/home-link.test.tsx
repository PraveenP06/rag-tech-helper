import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeLink } from "./home-link";

describe("HomeLink", () => {
  it("links back to the home page", () => {
    render(<HomeLink />);

    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
