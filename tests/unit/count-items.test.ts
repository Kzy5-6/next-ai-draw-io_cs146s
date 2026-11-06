import { describe, expect, it } from "vitest"
import { countItems } from "@/lib/count-items"

describe("countItems handoff contract", () => {
    it("counts a non-empty array", () => {
        expect(countItems(["a", "b"])).toBe(2)
    })

    it("returns zero for an empty array", () => {
        expect(countItems([])).toBe(0)
    })

    it("returns unknown for null", () => {
        expect(countItems(null)).toBe("未知")
    })
})
