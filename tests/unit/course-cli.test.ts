import { spawnSync } from "node:child_process"
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const root = process.cwd()
const cli = path.join(root, ".runtime", "course-cli.cjs")
const fixtures = path.join(root, "course-fixtures")
let tempRoot = ""

function run(args: string[]) {
    return spawnSync(process.execPath, [cli, ...args], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
    })
}

function check(input: string, output: string, extra: string[] = []) {
    return run(["check", "--input", input, "--output", output, ...extra])
}

beforeAll(() => {
    const build = spawnSync(
        process.execPath,
        ["scripts/build-course-cli.mjs"],
        {
            cwd: root,
            encoding: "utf8",
        },
    )
    if (build.status !== 0) {
        throw new Error(build.stderr || build.stdout || "CLI build failed")
    }
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "course-cli-test-"))
})

afterAll(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
})

describe("course CLI subprocess", () => {
    it("checks a normal diagram and writes a completed report", () => {
        const output = path.join(tempRoot, "normal.json")
        const result = check(path.join(fixtures, "normal.drawio"), output)
        expect(result.status).toBe(0)
        const report = JSON.parse(readFileSync(output, "utf8"))
        expect(report.status).toBe("completed")
    })

    it("uses error as the default threshold and warning as an opt-in threshold", () => {
        const input = path.join(fixtures, "labels.drawio")
        const defaultOutput = path.join(tempRoot, "labels-default.json")
        const warningOutput = path.join(tempRoot, "labels-warning.json")
        expect(check(input, defaultOutput).status).toBe(0)
        expect(
            check(input, warningOutput, ["--fail-on", "warning"]).status,
        ).toBe(1)
    })

    it("continues a batch after invalid XML and retains every result", () => {
        const output = path.join(tempRoot, "batch.json")
        const result = check(path.join(fixtures, "batch"), output, [
            "--fail-on",
            "warning",
        ])
        expect(result.status).toBe(2)
        const report = JSON.parse(readFileSync(output, "utf8"))
        expect(report.completed).toBe(3)
        expect(report.failed).toBe(1)
        expect(
            report.results.map((item: { file: string }) => item.file),
        ).toEqual([
            "a-normal.drawio",
            "b-warning.drawio",
            "c-error.drawio",
            "d-invalid.drawio",
        ])
        expect(report.results[3].status).toBe("invalid")
    })

    it("dry-run validates and plans without writing a report", () => {
        const output = path.join(tempRoot, "dry-run.json")
        const result = run([
            "check",
            "--input",
            path.join(fixtures, "batch"),
            "--dry-run",
            "--output",
            output,
        ])
        expect(result.status).toBe(0)
        expect(existsSync(output)).toBe(false)
        expect(result.stdout).toContain('"parsesDiagrams": false')
    })

    it("protects existing reports unless --force is provided", () => {
        const output = path.join(tempRoot, "protected.json")
        writeFileSync(output, "keep-this-report", "utf8")
        expect(check(path.join(fixtures, "normal.drawio"), output).status).toBe(
            2,
        )
        expect(readFileSync(output, "utf8")).toBe("keep-this-report")
        expect(
            check(path.join(fixtures, "normal.drawio"), output, ["--force"])
                .status,
        ).toBe(0)
        expect(JSON.parse(readFileSync(output, "utf8")).status).toBe(
            "completed",
        )
    })

    it("rejects output paths equal to the input", () => {
        const input = path.join(fixtures, "normal.drawio")
        const result = run(["check", "--input", input, "--output", input])
        expect(result.status).toBe(2)
    })

    it("rejects a missing output parent without creating it, including in dry-run", () => {
        const parent = path.join(tempRoot, "not-created")
        const result = run([
            "check",
            "--input",
            path.join(fixtures, "normal.drawio"),
            "--output",
            path.join(parent, "report.json"),
            "--dry-run",
        ])
        expect(result.status).toBe(2)
        expect(existsSync(parent)).toBe(false)
    })

    it("ignores nested diagrams in directory mode", () => {
        const input = path.join(tempRoot, "top-only")
        mkdirSync(path.join(input, "nested"), { recursive: true })
        writeFileSync(
            path.join(input, "one.drawio"),
            readFileSync(path.join(fixtures, "normal.drawio")),
        )
        writeFileSync(
            path.join(input, "nested", "two.drawio"),
            readFileSync(path.join(fixtures, "normal.drawio")),
        )
        const output = path.join(tempRoot, "top-only.json")
        const result = check(input, output)
        expect(result.status).toBe(0)
        const report = JSON.parse(readFileSync(output, "utf8"))
        expect(report.results).toHaveLength(1)
        expect(report.results[0].file).toBe("one.drawio")
    })

    it("compares reports without treating generatedAt changes as issue changes", () => {
        const output = path.join(tempRoot, "compare-time.json")
        check(path.join(fixtures, "labels.drawio"), output)
        const original = JSON.parse(readFileSync(output, "utf8"))
        const changed = { ...original, generatedAt: "2099-01-01T00:00:00.000Z" }
        const changedPath = path.join(tempRoot, "compare-time-changed.json")
        writeFileSync(changedPath, JSON.stringify(changed), "utf8")
        const result = run([
            "compare",
            "--before",
            output,
            "--after",
            changedPath,
        ])
        expect(result.status).toBe(0)
        expect(result.stdout).toContain('"added": []')
        expect(result.stdout).toContain('"resolved": []')
        expect(result.stdout).toContain('"persisting"')
    })

    it("reports configuration changes separately", () => {
        const before = path.join(tempRoot, "config-before.json")
        const after = path.join(tempRoot, "config-after.json")
        const input = path.join(fixtures, "free-endpoint.drawio")
        expect(check(input, before).status).toBe(0)
        expect(check(input, after, ["--config", "sketch"]).status).toBe(0)
        const result = run(["compare", "--before", before, "--after", after])
        expect(result.status).toBe(0)
        expect(result.stdout).toContain('"configurationChanged": true')
    })

    it("rejects malformed and non-completed reports for comparison", () => {
        const malformed = path.join(tempRoot, "malformed.json")
        writeFileSync(malformed, JSON.stringify({ nope: true }), "utf8")
        const malformedResult = run([
            "compare",
            "--before",
            malformed,
            "--after",
            malformed,
        ])
        expect(malformedResult.status).toBe(2)

        const invalidReport = path.join(tempRoot, "invalid-report.json")
        expect(
            check(path.join(fixtures, "invalid.drawio"), invalidReport).status,
        ).toBe(2)
        const invalidResult = run([
            "compare",
            "--before",
            invalidReport,
            "--after",
            invalidReport,
        ])
        expect(invalidResult.status).toBe(2)
        expect(invalidResult.stderr).toContain(
            "只有 completed 状态的报告可以比较",
        )
    })
})
