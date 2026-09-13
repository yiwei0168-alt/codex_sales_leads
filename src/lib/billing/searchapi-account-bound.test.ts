import { expect, it, vi } from "vitest";

const billing = vi.hoisted(() => ({ reserve: vi.fn(), denial: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./repository", () => ({ reservePaidCall: billing.reserve, settlePaidCall: vi.fn() }));
vi.mock("./denial-metrics", () => ({ recordBudgetDenial: billing.denial }));

import { withSpendContext } from "./context";
import { budgetedFetch } from "./paid-fetch";

it("blocks a product SearchAPI request before reservation or transport while account terms are unverified", async () => {
  const transport = vi.fn<typeof fetch>();
  const url = "https://www.searchapi.io/api/v1/search?engine=google&q=network&location=Colombia&gl=co&hl=es&num=10";
  await expect(withSpendContext({ userId: "fixture-user", operationId: "fixture-action", stage: "discovery" },
    () => budgetedFetch(transport)(url, { headers: { Authorization: "Bearer synthetic-secret" } })))
    .rejects.toMatchObject({ code: "missing-tariff" });
  expect(billing.reserve).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(billing.denial).toHaveBeenCalledOnce();
});
