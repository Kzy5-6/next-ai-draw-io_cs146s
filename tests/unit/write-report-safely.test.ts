import {
    chmod,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    stat,
    writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { writeReportSafely } from "@/lib/write-report-safely"

const temporaryRoots: string[] = []

afterEach(async () => {
    await Promise.all(
        temporaryRoots
            .splice(0)
            .map((root) => rm(root, { recursive: true, force: true })),
    )
})

describe("safe report writing", () => {
    it("preserves the existing target when the final rename fails", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "report-write-test-"))
        temporaryRoots.push(root)

        const output = path.join(root, "existing-report")
        await mkdir(output)
        await writeFile(
            path.join(output, "keep.txt"),
            "original report",
            "utf8",
        )

        await expect(
            writeReportSafely(output, '{"status":"completed"}'),
        ).rejects.toThrow()

        expect(await readFile(path.join(output, "keep.txt"), "utf8")).toBe(
            "original report",
        )

        const files = await readdir(root)
        expect(files).toEqual(["existing-report"])
    })

    it("replaces an existing regular report file", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "report-write-test-"))
        temporaryRoots.push(root)

        const output = path.join(root, "report.json")
        await writeFile(output, "old report", "utf8")

        await writeReportSafely(output, '{"status":"completed"}')

        expect(await readFile(output, "utf8")).toBe('{"status":"completed"}')
        expect(await readdir(root)).toEqual(["report.json"])
    })

    it("does not let concurrent writes interfere with each other", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "report-write-test-"))
        temporaryRoots.push(root)

        const output = path.join(root, "report.json")

        await Promise.all([
            writeReportSafely(output, "first report"),
            writeReportSafely(output, "second report"),
        ])

        expect(["first report", "second report"]).toContain(
            await readFile(output, "utf8"),
        )
        expect(await readdir(root)).toEqual(["report.json"])
    })

    it.skipIf(process.platform === "win32")(
        "preserves existing report permissions when replacing a file",
        async () => {
            const root = await mkdtemp(
                path.join(os.tmpdir(), "report-write-test-"),
            )
            temporaryRoots.push(root)

            const output = path.join(root, "private-report.json")
            await writeFile(output, "private report", "utf8")
            await chmod(output, 0o600)

            await writeReportSafely(output, '{"status":"completed"}')

            const result = await stat(output)
            expect(result.mode & 0o777).toBe(0o600)
        },
    )
})
