// Rebuild the historical source atlas without checking out or executing the application.
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve, posix } from "node:path"
import { fileURLToPath } from "node:url"
import { head, modules, annotations, workflows, scenarios } from "./atlas.config.mjs"
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, "../../../..")
const { parse } = createRequire(import.meta.url)("@babel/parser")
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
const review = JSON.parse(
  execFileSync("python3", [resolve(here, "build-data.py"), "--json"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
)
const paths = git("ls-tree", "-r", "--name-only", head)
  .trim()
  .split("\n")
  .filter(
    (p) =>
      ((/^(src\/|scripts\/|test\/|messages\/|docs\/(agents\/|adr\/))/.test(p) ||
        /^(AGENTS|CONTRIBUTING|CONTEXT|README)\.md$/.test(p) ||
        /^(package\.json|tsconfig\.json|next\.config\.ts|architecture\.test\.ts|messages\.test\.ts|bunfig\.toml|biome\.json|docs\/codebase-structure\.md)$/.test(
          p
        )) &&
        /\.(tsx?|mjs|js|css|json|md|toml)$/.test(p)) ||
      p === "public/service-worker.js" ||
      p === ".env.example"
  )
const pathSet = new Set(paths)
const moduleFor = (p) =>
  p === "src/proxy.ts"
    ? "app"
    : p === "public/service-worker.js"
      ? "notifications"
      : /^(README|CONTEXT|CONTRIBUTING|AGENTS)\.md$/.test(p)
        ? "docs"
        : p.startsWith("messages/") || p === "messages.test.ts"
          ? "i18n"
          : p === ".env.example"
            ? "config"
            : modules.filter((m) => p.startsWith(m.path + "/")).sort((a, b) => b.path.length - a.path.length)[0]?.id ||
              "tooling"
const resolveImport = (file, spec) => {
  const p = spec.startsWith("@/")
    ? "src/" + spec.slice(2)
    : spec.startsWith("@messages/")
      ? "messages/" + spec.slice(10)
      : spec.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(file), spec))
        : null
  return p
    ? [p, ...[".ts", ".tsx", ".js", ".mjs", ".json", ".css"].map((e) => p + e), p + "/index.ts", p + "/index.tsx"].find(
        (v) => pathSet.has(v)
      ) || null
    : null
}
const parseErrors = []
const files = paths.map((path) => {
  const content = git("show", `${head}:${path}`),
    imports = [],
    symbols = [],
    directives = []
  if (/\.(tsx?|mjs|js)$/.test(path))
    try {
      const ast = parse(content, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx"],
        createImportExpressions: true
      })
      directives.push(...ast.program.directives.map((d) => d.value.value))
      const visit = (n) => {
        if (!n || typeof n !== "object") return
        if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(n.type) && n.source)
          imports.push({
            spec: n.source.value,
            target: resolveImport(path, n.source.value),
            line: n.source.loc.start.line,
            typeOnly: n.importKind === "type" || n.exportKind === "type",
            kind: n.type === "ImportDeclaration" ? "import" : "re-export"
          })
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
        for (const [key, value] of Object.entries(n))
          if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) {
            if (Array.isArray(value)) value.forEach(visit)
            else if (value && typeof value === "object") visit(value)
          }
      }
      visit(ast.program)
    } catch (error) {
      parseErrors.push({ file: path, error: error.message })
    }
  const marks = Object.entries(annotations).flatMap(([id, list]) =>
    list.filter((a) => a.file === path).map((a) => ({ ...a, id }))
  )
  return {
    path,
    content,
    status: "unchanged",
    module: moduleFor(path),
    test: /\.(test|spec)\./.test(path) || path.startsWith("test/"),
    imports,
    symbols,
    directives,
    serverOnly: imports.some((i) => i.spec === "server-only"),
    marks
  }
})
const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
for (const f of files) {
  f.importedBy = files.flatMap((c) =>
    c.imports
      .filter((i) => i.target === f.path)
      .map((i) => ({ path: c.path, line: i.line, typeOnly: i.typeOnly, kind: i.kind }))
  )
  f.testLinks = [
    ...new Set([
      ...f.importedBy.filter((r) => byPath[r.path].test).map((r) => r.path),
      ...files
        .filter(
          (c) =>
            c.test && c.path.replace(/\.(test|spec)(?=\.)/, "").replace(/\.tsx?$/, "") === f.path.replace(/\.tsx?$/, "")
        )
        .map((c) => c.path)
    ])
  ]
}
const edges = new Map()
for (const f of files.filter((f) => !f.test))
  for (const i of f.imports) {
    const to = byPath[i.target]?.module
    if (!to || to === f.module) continue
    const key = f.module + "|" + to
    if (!edges.has(key)) edges.set(key, { from: f.module, to, count: 0, refs: [] })
    const edge = edges.get(key)
    edge.count++
    edge.refs.push({ file: f.path, line: i.line, target: i.target, typeOnly: i.typeOnly })
  }
const findings = review.findings.map((f) => ({
  ...f,
  body: f.raw.replace(/^##[^\n]+\n\n/, ""),
  axis: f.category,
  annotations: annotations[f.id] || [],
  sourceModules: [...new Set((annotations[f.id] || []).map((a) => moduleFor(a.file)))],
  unindexed: f.paths.filter((p) => !byPath[p.split(":")[0]])
}))
for (const f of findings) {
  if (!f.annotations.length) throw new Error("No source anchors for " + f.id)
  for (const a of f.annotations) {
    if (!byPath[a.file]) throw new Error("Missing annotation file " + a.file)
    if (a.from < 1 || a.to < a.from || a.to > byPath[a.file].content.split("\n").length)
      throw new Error("Annotation exceeds source: " + f.id + " " + a.file + ":" + a.to)
  }
}
for (const m of modules) {
  m.files = files.filter((f) => f.module === m.id && !f.test).map((f) => f.path)
  m.annotated = m.files.filter((p) => byPath[p].marks.length).length
  m.findings = findings.filter((f) => f.sourceModules.includes(m.id) || f.modules.includes(m.id)).map((f) => f.id)
  if (!byPath[m.entry]) throw new Error("Missing module entry " + m.entry)
}
for (const w of workflows)
  for (const s of w.steps) {
    const f = byPath[s.file]
    if (!f) throw new Error("Missing trace file " + s.file)
    if (s.symbol) {
      const symbol = f.symbols.find((v) => v.name === s.symbol)
      if (!symbol) throw new Error("Missing trace symbol " + s.symbol)
      s.line = symbol.line
      s.end = symbol.end
    } else if (s.line < 1 || s.end > f.content.split("\n").length)
      throw new Error("Trace range outside source " + s.file)
    s.module = f.module
  }
for (const s of scenarios)
  if (s.findings.some((id) => !findings.some((f) => f.id === id)) || !workflows.some((w) => w.id === s.workflow))
    throw new Error("Invalid scenario references " + s.id)
const data = {
  snapshot: {
    head,
    date: review.snapshot.date,
    branch: review.snapshot.branch,
    fileCount: files.length,
    annotatedCount: files.filter((f) => f.marks.length).length,
    parseErrors
  },
  files,
  modules,
  edges: [...edges.values()],
  findings,
  workflows,
  scenarios,
  review,
  report: review.documents.find((d) => d.file === "README.md").raw
}
const script =
  "// Generated from the pinned Git snapshot and canonical review.\nwindow.ATLAS_DATA = " +
  JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029") +
  ";\n"
writeFileSync(resolve(here, "data.js"), script)
const html = readFileSync(resolve(here, "index.html"), "utf8")
  .replace(
    '<link rel="stylesheet" href="styles.css">',
    () => "<style>" + readFileSync(resolve(here, "styles.css"), "utf8") + "</style>"
  )
  .replace(/ {2}<script src="(?:data|labs|app)\.js" defer><\/script>\n/g, "")
  .replace('href="../README.md"', 'href="README.md"')
  .replace(
    "</body>",
    () =>
      "<script>" +
      script +
      "\n" +
      (readFileSync(resolve(here, "labs.js"), "utf8") + "\n" + readFileSync(resolve(here, "app.js"), "utf8")).replace(
        /<\/script/gi,
        "<\\/script"
      ) +
      "</script>\n</body>"
  )
writeFileSync(resolve(here, "../atlas.html"), html)
console.log(
  `Built ${files.length} files, ${edges.size} real module edges, ${findings.length} findings, ${workflows.length} traces and ${scenarios.length} experiments. Parse errors: ${parseErrors.length}.`
)
if (parseErrors.length) {
  console.error(parseErrors)
  process.exitCode = 1
}
