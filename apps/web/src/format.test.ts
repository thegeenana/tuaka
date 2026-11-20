import { describe, expect, it } from "vitest";
import { groupDigits, longDate, money, termText } from "./format";

describe("format", () => {
  it("groups digits without touching decimals", () => {
    expect(groupDigits("99394.20")).toBe("99,394.20");
    expect(groupDigits("1000000")).toBe("1,000,000");
    expect(groupDigits("536.82")).toBe("536.82");
    expect(groupDigits("-1234.5")).toBe("-1,234.5");
  });

  it("formats money with a symbol", () => {
    expect(money("100000.00", "GBP")).toBe("£100,000.00");
    expect(money("12.5", "GHS")).toBe("GH₵12.5");
  });

  it("formats dates and terms", () => {
    expect(longDate("2054-07-01")).toBe("1 Jul 2054");
    expect(termText(360)).toBe("30 years");
    expect(termText(169)).toBe("14 years 1 month");
    expect(termText(1)).toBe("1 month");
  });
});
