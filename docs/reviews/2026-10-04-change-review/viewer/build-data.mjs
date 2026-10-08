// Rebuild an offline, immutable source snapshot from Git. No environment files or live data.
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve, posix } from "node:path"
import { fileURLToPath } from "node:url"
import { base, head, modules, annotations, workflows, scenarios } from "./atlas.config.mjs"
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../..")
const require = createRequire(import.meta.url)
const { parse } = require("@babel/parser")
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
const includePath = (p) =>
  /^(src\/|scripts\/|test\/|messages\/)/.test(p) ||
  /^(AGENTS|CONTRIBUTING|CONTEXT|README)\.md$/.test(p) ||
  /^docs\/(agents\/|adr\/|codebase-structure\.md|Groups - DB Scheme\.md)/.test(p) ||
  /^(package\.json|tsconfig\.json|next\.config\.ts|architecture\.test\.ts|bunfig\.toml|biome\.json)$/.test(p)
const paths = git("ls-tree", "-r", "--name-only", head)
  .trim()
  .split("\n")
  .filter(includePath)
  .filter((p) => /\.(tsx?|mjs|css|json|md|toml)$/.test(p))
const pathSet = new Set(paths)
const basePaths = new Set(git("ls-tree", "-r", "--name-only", base).trim().split("\n"))
const changes = {}
for (const row of git("diff", "--name-status", "-M", `${base}...${head}`).trim().split("\n")) {
  const [status, a, b] = row.split("\t")
  if (!a) continue
  changes[b || a] = { status: status[0], beforePath: b ? a : a }
}
for (const [path, change] of Object.entries(changes))
  if (change.status === "D" && includePath(path) && /\.(tsx?|mjs|css|json|md|toml)$/.test(path)) {
    paths.push(path)
    pathSet.add(path)
  }
const moduleFor = (p) =>
  modules.find((m) => m.id === "app" && (p.startsWith("src/app/") || p === "src/proxy.ts"))?.id ||
  modules.filter((m) => m.id !== "app" && p.startsWith(m.path + "/")).sort((a, b) => b.path.length - a.path.length)[0]
    ?.id ||
  "context"
const resolveImport = (file, spec) => {
  const p = spec.startsWith("@/")
    ? "src/" + spec.slice(2)
    : spec.startsWith("@test/")
      ? "test/" + spec.slice(6)
      : spec.startsWith("@messages/")
        ? "messages/" + spec.slice(10)
        : spec.startsWith(".")
          ? posix.normalize(posix.join(posix.dirname(file), spec))
          : null
  if (!p) return null
  return (
    [p, ...[".ts", ".tsx", ".js", ".mjs", ".json", ".css"].map((e) => p + e), p + "/index.ts", p + "/index.tsx"].find(
      (x) => pathSet.has(x)
    ) || null
  )
}
const files = []
const parseErrors = []
for (const path of paths) {
  const change = changes[path]
  const content = change?.status === "D" ? "" : git("show", `${head}:${path}`)
  let before = null,
    diff = ""
  if (change) {
    if (basePaths.has(change.beforePath)) before = git("show", `${base}:${change.beforePath}`)
    diff = git("diff", "--no-ext-diff", "--unified=3", `${base}...${head}`, "--", change.beforePath, path)
  }
  const imports = [],
    symbols = [],
    directives = []
  if (/\.(tsx?|mjs)$/.test(path))
    try {
      const ast = parse(content, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx"],
        createImportExpressions: true
      })
      directives.push(...ast.program.directives.map((d) => d.value.value))
      const visit = (n) => {
        if (!n || typeof n !== "object") return
        if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(n.type) && n.source) {
          imports.push({
            spec: n.source.value,
            target: resolveImport(path, n.source.value),
            line: n.source.loc.start.line,
            typeOnly: n.importKind === "type" || n.exportKind === "type",
            kind: n.type === "ImportDeclaration" ? "import" : "re-export"
          })
        }
        if (n.type === "ImportExpression" && n.source?.type === "StringLiteral")
          imports.push({
            spec: n.source.value,
            target: resolveImport(path, n.source.value),
            line: n.loc.start.line,
            typeOnly: false,
            kind: "dynamic"
          })
        if (
          [
            "FunctionDeclaration",
            "ClassDeclaration",
            "TSTypeAliasDeclaration",
            "TSInterfaceDeclaration",
            "TSEnumDeclaration"
          ].includes(n.type) &&
          n.id
        )
          symbols.push({
            name: n.id.name,
            line: n.loc.start.line,
            end: n.loc.end.line,
            kind: n.type.replace("Declaration", "").replace("TS", "").toLowerCase()
          })
        if (n.type === "VariableDeclarator" && n.id?.type === "Identifier" && n.init)
          symbols.push({
            name: n.id.name,
            line: n.loc.start.line,
            end: n.loc.end.line,
            kind: ["ArrowFunctionExpression", "FunctionExpression"].includes(n.init.type) ? "function" : "value"
          })
        for (const [key, v] of Object.entries(n))
          if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) {
            if (Array.isArray(v)) v.forEach(visit)
            else if (v && typeof v === "object") visit(v)
          }
      }
      visit(ast.program)
    } catch (error) {
      parseErrors.push({ file: path, error: error.message })
    }
  const added = []
  for (const h of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const count = Number(h[2] ?? 1)
    if (count) added.push([Number(h[1]), Number(h[1]) + count - 1])
  }
  const marks = Object.entries(annotations).flatMap(([id, list]) =>
    list.filter((a) => a.file === path).map((a) => ({ ...a, id }))
  )
  files.push({
    path,
    content,
    before,
    diff,
    status: change?.status || "unchanged",
    beforePath: change?.beforePath,
    module: moduleFor(path),
    test: /\.(test|spec)\./.test(path) || path.startsWith("test/"),
    imports,
    symbols,
    directives,
    serverOnly: imports.some((i) => i.spec === "server-only"),
    marks,
    changedRanges: added
  })
}
const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
for (const f of files)
  f.importedBy = files.flatMap((c) =>
    c.imports
      .filter((i) => i.target === f.path)
      .map((i) => ({ path: c.path, line: i.line, typeOnly: i.typeOnly, kind: i.kind }))
  )
const edges = new Map()
for (const f of files.filter((f) => !f.test && f.status !== "D"))
  for (const i of f.imports) {
    const to = byPath[i.target]?.module
    if (!to || to === f.module || to === "context" || f.module === "context") continue
    const key = f.module + "|" + to
    if (!edges.has(key)) edges.set(key, { from: f.module, to, count: 0, runtime: 0, refs: [] })
    const edge = edges.get(key)
    edge.count++
    if (!i.typeOnly) edge.runtime++
    edge.refs.push({ file: f.path, line: i.line, target: i.target, typeOnly: i.typeOnly })
  }
const report = readFileSync(resolve(here, "../README.md"), "utf8")
const findings = [
  ...report.matchAll(/^### ((?:STD|SPEC|PROD)-\d+) — (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)
].map((m) => {
  const body = m[3].trim()
  const get = (key) => body.match(new RegExp(key + ": ([^.\\n]+)"))?.[1]?.trim() || ""
  const id = m[1]
  return {
    id,
    title: m[2],
    body,
    severity: get("Severity"),
    confidence: get("Confidence"),
    effort: get("Effort"),
    type: get("Type"),
    axis: id.startsWith("STD") ? "Standards" : id.startsWith("SPEC") ? "Spec" : "Production",
    annotations: annotations[id] || [],
    modules: [...new Set((annotations[id] || []).map((a) => moduleFor(a.file)))]
  }
})
if (findings.length !== 9) throw new Error(`Expected 9 canonical findings; read ${findings.length}`)
for (const m of modules) {
  m.files = files.filter((f) => f.module === m.id && !f.test && f.status !== "D").map((f) => f.path)
  m.changed = m.files.filter((p) => byPath[p].status !== "unchanged").length
  m.findings = findings.filter((f) => f.modules.includes(m.id)).map((f) => f.id)
}
for (const w of workflows)
  for (const step of w.steps) {
    const file = byPath[step.file]
    if (!file) throw new Error("Missing workflow file " + step.file)
    const symbol = file.symbols.find((s) => s.name === step.symbol)
    if (!symbol) throw new Error("Missing symbol " + step.symbol + " in " + step.file)
    step.line = symbol.line
    step.end = symbol.end
    step.module = file.module
  }
for (const f of findings)
  for (const a of f.annotations) {
    if (!byPath[a.file]) throw new Error("Missing annotation file " + a.file)
    if (a.to > byPath[a.file].content.split("\n").length) throw new Error("Annotation exceeds source " + a.file)
  }
const commits = git("log", `${base}..${head}`, "--format=%H%x09%s")
  .trim()
  .split("\n")
  .map((l) => {
    const [sha, ...title] = l.split("\t")
    return {
      sha,
      title: title.join("\t"),
      files: git("diff-tree", "--no-commit-id", "-r", "--name-only", sha)
        .trim()
        .split("\n")
        .filter((p) => byPath[p])
    }
  })
const data = {
  snapshot: {
    base,
    head,
    date: "2026-10-04",
    branch: "80-admin-groups",
    template: "astra_review_template",
    fileCount: files.length,
    changedCount: files.filter((f) => f.status !== "unchanged").length,
    parseErrors
  },
  files,
  modules,
  edges: [...edges.values()],
  findings,
  workflows,
  scenarios,
  commits,
  report
}
const dataScript =
  "// Generated by build-data.mjs from the pinned Git snapshot.\nwindow.ATLAS_DATA = " +
  JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029") +
  ";\n"
writeFileSync(resolve(here, "data.js"), dataScript)
const html = readFileSync(resolve(here, "index.html"), "utf8")
  .replace(
    '<link rel="stylesheet" href="styles.css">',
    () => "<style>" + readFileSync(resolve(here, "styles.css"), "utf8") + "</style>"
  )
  .replace(/ {2}<script src="(?:data|app)\.js" defer><\/script>\n/g, "")
  .replace('href="../README.md"', 'href="README.md"')
  .replace(
    "</body>",
    () =>
      "<script>" +
      dataScript +
      "\n" +
      readFileSync(resolve(here, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script") +
      "</script>\n</body>"
  )
writeFileSync(resolve(here, "../atlas.html"), html)
console.log(
  `Built ${files.length} files, ${[...edges.values()].length} module edges, ${findings.length} findings, ${workflows.length} verified traces. Parse errors: ${parseErrors.length}.`
)
if (parseErrors.length) {
  console.error(parseErrors)
  process.exitCode = 1
}
