import { describe, expect, it } from "vitest";

import { allowedTransitions, canCancel, findTransition, nextStatus, previousStatus, STATUS_FLOW } from "./order-status";

const targets = (...args: Parameters<typeof allowedTransitions>) => allowedTransitions(...args).map((t) => `${t.move}:${t.to}`);

describe("order status flow", () => {
  it("goes forward one step at a time, ending at closed", () => {
    expect(STATUS_FLOW.map(nextStatus)).toEqual([
      "proforma",
      "confirmed",
      "in_production",
      "ready",
      "loading",
      "shipped",
      "closed",
      null,
    ]);
    expect(nextStatus("cancelled")).toBeNull();
  });

  it("can be cancelled from any status before shipped", () => {
    expect(STATUS_FLOW.filter(canCancel)).toEqual(["offer", "proforma", "confirmed", "in_production", "ready", "loading"]);
    expect(canCancel("shipped")).toBe(false);
    expect(canCancel("closed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });

  it("offers export the next step and cancel only", () => {
    expect(targets("offer", { mayStepBack: false })).toEqual(["forward:proforma", "cancel:cancelled"]);
    expect(targets("loading", { mayStepBack: false })).toEqual(["forward:shipped", "cancel:cancelled"]);
    expect(targets("shipped", { mayStepBack: false })).toEqual(["forward:closed"]);
    expect(targets("closed", { mayStepBack: false })).toEqual([]);
    expect(targets("cancelled", { mayStepBack: false, cancelledFrom: "ready" })).toEqual([]);
  });

  it("lets an admin step back one status — a cancelled order back to where it was cancelled from", () => {
    expect(targets("confirmed", { mayStepBack: true })).toEqual(["forward:in_production", "cancel:cancelled", "back:proforma"]);
    expect(targets("offer", { mayStepBack: true })).toEqual(["forward:proforma", "cancel:cancelled"]);
    expect(targets("closed", { mayStepBack: true })).toEqual(["back:shipped"]);
    expect(targets("cancelled", { mayStepBack: true, cancelledFrom: "ready" })).toEqual(["back:ready"]);
    expect(previousStatus("cancelled", null)).toBeNull();
  });

  it("refuses skipping steps and moves that aren't allowed", () => {
    expect(findTransition("offer", "confirmed", { mayStepBack: true })).toBeNull();
    expect(findTransition("proforma", "offer", { mayStepBack: false })).toBeNull();
    expect(findTransition("proforma", "offer", { mayStepBack: true })).toEqual({ to: "offer", move: "back" });
    expect(findTransition("shipped", "cancelled", { mayStepBack: true })).toBeNull();
  });
});
