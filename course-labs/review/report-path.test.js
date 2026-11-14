const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { resolveReportPath } = require("./report-path")

test("accepts a report file inside the output directory", () => {
    assert.equal(
        resolveReportPath("C:/work/reports", "summary.json"),
        path.resolve("C:/work/reports", "summary.json"),
    )
})

test("rejects parent-directory traversal", () => {
    assert.throws(
        () => resolveReportPath("C:/work/reports", "../secrets.txt"),
        /escapes/,
    )
})

test("rejects sibling paths sharing the output directory prefix", () => {
    assert.throws(
        () =>
            resolveReportPath(
                "C:/work/reports",
                "../reports-private/secret.json",
            ),
        /escapes/,
    )
})

test("rejects absolute paths outside the output directory", () => {
    assert.throws(
        () =>
            resolveReportPath("C:/work/reports", "C:/work/private/secret.json"),
        /escapes/,
    )
})
