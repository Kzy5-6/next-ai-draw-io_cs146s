import { mkdir } from "node:fs/promises"
import path from "node:path"
import { build } from "esbuild"

const root = process.cwd()
const output = path.join(root, ".runtime", "course-cli.cjs")

await mkdir(path.dirname(output), { recursive: true })

await build({
    entryPoints: [path.join(root, "scripts", "course-cli.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    alias: { "@": root },
    packages: "bundle",
    sourcemap: true,
    external: ["node:*"],
    logLevel: "info",
})

console.log(`Course CLI built: ${path.relative(root, output)}`)
