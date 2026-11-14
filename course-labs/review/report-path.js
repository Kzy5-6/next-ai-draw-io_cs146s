const path = require("node:path")

function resolveReportPath(outputDirectory, requestedName) {
    const base = path.resolve(outputDirectory)
    const target = path.resolve(base, requestedName)
    const relative = path.relative(base, target)

    if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw new Error("Report path escapes output directory")
    }

    return target
}

module.exports = { resolveReportPath }
