import { describe, expect, it } from "vitest";
import { clientInitials, clientPrimaryName, clientSecondaryName } from "./client-name";

describe("visible customer identity", () => {
    it("uses the legal name as the primary name and the trade name as the subtitle", () => {
        const client = { name: "Fictional Harbor Supplies Inc.", tradeName: "Harbor Supplies" };
        expect(clientPrimaryName(client)).toBe("Fictional Harbor Supplies Inc.");
        expect(clientSecondaryName(client)).toBe("Harbor Supplies");
        expect(clientInitials(client)).toBe("FH");
    });

    it("does not repeat the subtitle when both names are equivalent", () => {
        expect(clientSecondaryName({ name: "Paw Corner", tradeName: "  PAW CORNER  " })).toBe("");
    });

    it("keeps a readable fallback when the legal name is missing", () => {
        expect(clientPrimaryName({ name: "", tradeName: "Meadow Market" })).toBe("Meadow Market");
    });
});
