import { randomUUID } from "node:crypto"
import { open, rename, stat, unlink } from "node:fs/promises"
import path from "node:path"

const writesInProgress = new Map<string, Promise<void>>()

export async function writeReportSafely(
    output: string,
    content: string,
): Promise<void> {
    const resolvedOutput = path.resolve(output)
    const key =
        process.platform === "win32"
            ? resolvedOutput.toLowerCase()
            : resolvedOutput

    const previous = writesInProgress.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
        release = resolve
    })

    writesInProgress.set(key, current)
    await previous

    try {
        await writeReportAtomically(resolvedOutput, content)
    } finally {
        release()
        if (writesInProgress.get(key) === current) {
            writesInProgress.delete(key)
        }
    }
}

async function writeReportAtomically(
    output: string,
    content: string,
): Promise<void> {
    const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`
    let ownsTemporary = false

    try {
        const existing = await stat(output).catch(
            (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null
                throw error
            },
        )

        const handle = await open(temporary, "wx", 0o600)
        ownsTemporary = true

        try {
            await handle.writeFile(content, "utf8")
            await handle.chmod(existing ? existing.mode & 0o777 : 0o600)
        } finally {
            await handle.close()
        }

        await rename(temporary, output)
        ownsTemporary = false
    } catch (error) {
        if (ownsTemporary) {
            await unlink(temporary).catch(() => undefined)
        }

        throw new Error(
            `Failed to write report: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        )
    }
}
