import { describe, expect, it } from "vitest";
import { longDate } from "./format";
describe("date formatting", () => {
    it("keeps the calendar day for date-only values", () => {
        expect(longDate("2026-07-17")).toContain("17 July 2026");
    });
});
