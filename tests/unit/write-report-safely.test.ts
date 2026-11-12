import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
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
})
