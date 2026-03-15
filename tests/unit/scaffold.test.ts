import { describe, it, expect } from "vitest";
import {
  MEMBERSHIP_FEES,
  APPLICATION_FEE,
  MAX_SUB_MEMBERS,
  EXPIRY_REMINDER_DAYS,
} from "@/types/index";

describe("T01 Scaffold — constants and types", () => {
  it("defines correct membership fees", () => {
    expect(MEMBERSHIP_FEES.MONTHLY).toBe(250);
    expect(MEMBERSHIP_FEES.HALF_YEARLY).toBe(1500);
    expect(MEMBERSHIP_FEES.ANNUAL).toBe(3000);
  });

  it("defines correct application fee", () => {
    expect(APPLICATION_FEE).toBe(10000);
  });

  it("defines max sub-members as 3", () => {
    expect(MAX_SUB_MEMBERS).toBe(3);
  });

  it("defines expiry reminder as 15 days", () => {
    expect(EXPIRY_REMINDER_DAYS).toBe(15);
  });
});
