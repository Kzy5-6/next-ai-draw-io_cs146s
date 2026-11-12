import { rename, unlink, writeFile } from "node:fs/promises"

export async function writeReportSafely(
    output: string,
    content: string,
): Promise<void> {
    const temporary = `${output}.${process.pid}.${Date.now()}.tmp`
    try {
        await writeFile(temporary, content, { encoding: "utf8", flag: "wx" })
        await rename(temporary, output)
    } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw new Error(
            `???????????????${error instanceof Error ? error.message : String(error)}`,
        )
    }
}
