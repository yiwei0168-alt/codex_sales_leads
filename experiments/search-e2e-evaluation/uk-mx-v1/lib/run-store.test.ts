import { describe, expect, it, vi } from "vitest";

import { renameWithTransientRetry } from "./run-store";

describe("formal experiment run store", () => {
  it("retries transient Windows rename failures", async () => {
    const rename = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EPERM" }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }))
      .mockResolvedValueOnce();

    await renameWithTransientRetry("source", "destination", rename, [0, 0]);

    expect(rename).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent rename failures", async () => {
    const rename = vi.fn<() => Promise<void>>()
      .mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await expect(renameWithTransientRetry("source", "destination", rename, [0, 0]))
      .rejects.toThrow("missing");
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
