import { describe, expect, it } from "vitest";
import { cycleSort, emptySort, sortItems } from "./sorting";
describe("three-state sorting", () => {
    it("cycles through ascending, descending, and original order", () => {
        const initial = emptySort<"value">();
        const ascending = cycleSort(initial, "value");
        const descending = cycleSort(ascending, "value");
        expect(ascending).toEqual({ key: "value", direction: "asc" });
        expect(descending).toEqual({ key: "value", direction: "desc" });
        expect(cycleSort(descending, "value")).toEqual(initial);
    });
    it("sorts stably and restores the input when sorting is cleared", () => {
        const rows = [{ id: "a", value: 2 }, { id: "b", value: 1 }, { id: "c", value: 2 }];
        expect(sortItems(rows, { key: "value", direction: "asc" }, (row) => row.value).map((row) => row.id)).toEqual(["b", "a", "c"]);
        expect(sortItems(rows, emptySort<"value">(), (row) => row.value).map((row) => row.id)).toEqual(["a", "b", "c"]);
    });
});
