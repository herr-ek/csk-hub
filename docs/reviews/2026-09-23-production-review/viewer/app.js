/* Offline snapshot explorer. No service, telemetry, network fetches or live repository mutations. */
;(() => {
  const D = window.ATLAS_DATA
  const $ = (s) => document.querySelector(s)
  const content = $("#workspace-content")
  if (!D) {
    content.innerHTML =
      '<p class="empty">Snapshot data could not load. Keep data.js, app.js and styles.css beside index.html.</p>'
    return
  }
  const files = Object.fromEntries(D.files.map((f) => [f.path, f]))
  const modules = Object.fromEntries(D.modules.map((m) => [m.id, m]))
  const findings = Object.fromEntries(D.findings.map((f) => [f.id, f]))
  const e = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    )
  const icons = {
    map: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M7 10v7h7M10 7h7v7"/>',
    source: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-17-2 20"/>',
    traces:
      '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 6h8"/>',
    lab: '<path d="M9 2h6M10 2v7L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V2M8 15h8"/>',
    review: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
    evidence: '<path d="M5 2h10l4 4v16H5ZM15 2v5h4M8 11h8M8 15h8M8 19h5"/>'
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
  const viewNames = {
    map: "Map",
    source: "Files",
    traces: "Traces",
    lab: "Lab",
    review: "Review",
    evidence: "Evidence"
  }
  let state = {},
    lens = "all",
    searchTimer,
    toastTimer
  let treeFilter = "",
    changedOnly = false,
    includeTests = false
  let lastFile = "src/core/auth/auth.ts"
  function nav(values) {
    location.hash = new URLSearchParams(values).toString()
  }
  function openFile(path, line = 1, to = line) {
    if (!files[path]) return
    lastFile = path
    nav({ view: "source", file: path, line: String(line), to: String(to) })
  }
  function announce(text) {
    $("#announcement").textContent = text
  }
  function toast(text) {
    $("#toast").textContent = text
    $("#toast").hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      $("#toast").hidden = true
    }, 2500)
  }
  function chip(id) {
    const f = findings[id]
    return f
      ? `<button class="finding-chip ${f.severity.toLowerCase()}" data-finding="${e(id)}">${e(id)}<span>${e(f.severity)}</span></button>`
      : ""
  }
  function sourceButton(path, label, line = 1, to = line, cls = "compact-link") {
    return `<button class="${cls}" data-file="${e(path)}" data-line="${line}" data-to="${to}">${label}</button>`
  }
  function showDialog(id) {
    const dialog = $("#" + id)
    if (!dialog.open) dialog.showModal()
  }
  function closeDialogs() {
    document.querySelectorAll("dialog[open]").forEach((d) => {
      d.close()
    })
  }
  let markdownBase = ""
  function inline(text) {
    const tokens = []
    let value = String(text).replace(/`([^`]+)`/g, (_, code) => {
      tokens.push(`<code>${e(code)}</code>`)
      return `\uE000${tokens.length - 1}\uE000`
    })
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, title, url) => {
      let rendered = e(title)
      const [docFile, docAnchor] = url.split("#")
      const currentDoc = markdownBase.startsWith("@review/") ? markdownBase.slice(8) : null
      if ((currentDoc && documents[docFile]) || (currentDoc && !docFile && docAnchor))
        rendered = `<button class="inline-link" data-document="${e(docFile || currentDoc)}" data-anchor="${e(docAnchor || "")}">${e(title)}</button>`
      else if (url.startsWith("https://") || url.startsWith("#"))
        rendered = `<a href="${e(url)}" ${url.startsWith("https://") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${e(title)}</a>`
      else if (markdownBase) {
        const parts = (markdownBase.split("/").slice(0, -1).join("/") + "/" + url.split("#")[0]).split("/"),
          resolved = []
        for (const part of parts) {
          if (part === "..") resolved.pop()
          else if (part && part !== ".") resolved.push(part)
        }
        const path = resolved.join("/")
        if (files[path]) rendered = `<button class="inline-link" data-file="${e(path)}">${e(title)}</button>`
      }
      tokens.push(rendered)
      return `\uE000${tokens.length - 1}\uE000`
    })
    value = e(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    return value.replace(/\uE000(\d+)\uE000/g, (_, i) => tokens[Number(i)])
  }
  function markdown(text, path = "") {
    markdownBase = path
    const lines = String(text).split("\n")
    let html = "",
      list = false,
      paragraph = []
    const flush = () => {
      if (paragraph.length) {
        html += `<p>${inline(paragraph.join(" "))}</p>`
        paragraph = []
      }
    }
    const close = () => {
      if (list) {
        html += "</ul>"
        list = false
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith("```")) {
        flush()
        close()
        const code = []
        while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i])
        html += `<pre><code>${e(code.join("\n"))}</code></pre>`
        continue
      }
      const explicitAnchor = line.match(/^<a id="([^"<>]+)"><\/a>$/)
      if (explicitAnchor) {
        flush()
        close()
        html += `<span id="${e(explicitAnchor[1])}"></span>`
        continue
      }
      const heading = line.match(/^(#{1,6}) (.+)$/)
      if (heading) {
        flush()
        close()
        const n = heading[1].length
        const id = heading[2]
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
        html += `<h${n} id="${e(id)}">${inline(heading[2])}</h${n}>`
        continue
      }
      if (/^\|/.test(line) && /^\|[ :|-]+\|\s*$/.test(lines[i + 1] || "")) {
        flush()
        close()
        const cells = (l) =>
          l
            .replace(/^\||\|\s*$/g, "")
            .split("|")
            .map((c) => c.trim())
        html +=
          "<table><thead><tr>" +
          cells(line)
            .map((c) => `<th>${inline(c)}</th>`)
            .join("") +
          "</tr></thead><tbody>"
        i++
        while (/^\|/.test(lines[i + 1] || "")) {
          i++
          html +=
            "<tr>" +
            cells(lines[i])
              .map((c) => `<td>${inline(c)}</td>`)
              .join("") +
            "</tr>"
        }
        html += "</tbody></table>"
        continue
      }
      if (/^- /.test(line)) {
        flush()
        if (!list) {
          html += "<ul>"
          list = true
        }
        html += `<li>${inline(line.slice(2))}</li>`
        continue
      }
      if (!line.trim()) {
        flush()
        close()
        continue
      }
      if (/^> /.test(line)) {
        flush()
        close()
        html += `<blockquote>${inline(line.slice(2))}</blockquote>`
        continue
      }
      close()
      paragraph.push(line)
    }
    flush()
    close()
    return html
  }
  function renderTree() {
    const paths = D.files.filter(
      (f) =>
        (includeTests || !f.test) &&
        (!changedOnly || f.marks.length > 0) &&
        f.path.toLowerCase().includes(treeFilter.toLowerCase())
    )
    const root = { dirs: {}, files: [] }
    for (const f of paths) {
      const parts = f.path.split("/")
      let node = root
      for (const part of parts.slice(0, -1)) {
        node.dirs[part] ??= { dirs: {}, files: [] }
        node = node.dirs[part]
      }
      node.files.push(f)
    }
    const render = (node, prefix = "") =>
      Object.keys(node.dirs)
        .sort()
        .map((name) => {
          const path = prefix + name + "/"
          const open =
            treeFilter ||
            path === "src/" ||
            state.file?.startsWith(path) ||
            path === "src/features/" ||
            path === "src/features/messaging/"
          return `<details data-folder="${e(path)}" ${open ? "open" : ""}><summary>${e(name)}</summary><div class="tree-children">${render(node.dirs[name], path)}</div></details>`
        })
        .join("") +
      node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((f) => {
          const count = new Set(f.marks.map((a) => a.id)).size
          return `<button class="file-row ${state.file === f.path ? "selected" : ""}" data-file="${e(f.path)}" title="${e(f.path)}"><span class="file-type">${/tsx$/.test(f.path) ? "tsx" : /\.md$/.test(f.path) ? "md" : (f.path === ".env.example" ? "env" : f.path.split(".").at(-1))}</span><span class="file-name">${e(f.path.split("/").at(-1))}</span>${count ? `<span class="finding-count">${count}</span>` : ""}${f.status !== "unchanged" ? `<span class="change-letter">${f.status}</span>` : ""}</button>`
        })
        .join("")
    $("#file-tree").innerHTML = paths.length ? render(root) : '<p class="empty">No matching files.</p>'
    $("#snapshot-count").textContent = `${paths.length} files shown · ${D.snapshot.fileCount} embedded`
  }
  function headings(title, description, extra = "") {
    return `<div class="view-heading"><div><div class="eyebrow">${e(state.view === "source" ? "SOURCE SNAPSHOT" : "EXPLORE / " + viewNames[state.view].toUpperCase())}</div><h1>${e(title)}</h1><p>${e(description)}</p></div>${extra}</div>`
  }
  function renderMap() {
    const selected = modules[state.module] || modules.auth
    const connected = new Set([selected.id])
    for (const edge of D.edges)
      if (edge.from === selected.id || edge.to === selected.id) {
        connected.add(edge.from)
        connected.add(edge.to)
      }
    const shown = D.modules.filter((m) => lens !== "annotated" || m.findings.length || m.id === selected.id)
    const ids = new Set(shown.map((m) => m.id))
    const edges = D.edges
      .filter((ed) => ids.has(ed.from) && ids.has(ed.to))
      .map((ed) => {
        const a = modules[ed.from],
          b = modules[ed.to],
          focused = ed.from === selected.id || ed.to === selected.id
        let x1 = a.x + 105,
          y1 = a.y + 104,
          x2 = b.x + 105,
          y2 = b.y
        if (Math.abs(a.y - b.y) < 120) {
          x1 = a.x + (b.x > a.x ? 210 : 0)
          x2 = b.x + (b.x > a.x ? 0 : 210)
          y1 = a.y + 50
          y2 = b.y + 50
        } else if (b.y < a.y) {
          y1 = a.y
          y2 = b.y + 104
        }
        const mid = (y1 + y2) / 2
        const path =
          Math.abs(a.y - b.y) < 120
            ? `M${x1},${y1} C${(x1 + x2) / 2},${y1 - 50} ${(x1 + x2) / 2},${y2 - 50} ${x2},${y2}`
            : `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`
        return `<path class="map-edge ${focused ? "focused" : "dim"}" d="${path}" marker-end="url(#edge-marker)"><title>${e(a.name)} imports ${e(b.name)} · ${ed.count} source references</title></path>`
      })
      .join("")
    const nodes = shown
      .map(
        (m) =>
          `<g class="node ${m.id === selected.id ? "selected" : !connected.has(m.id) ? "dim" : ""}" transform="translate(${m.x},${m.y})" role="button" tabindex="0" aria-label="Explore ${e(m.name)}, ${m.files.length} files, ${m.findings.length} findings" aria-pressed="${m.id === selected.id}" data-module="${m.id}"><title>${e(m.name)} · ${e(m.path)}</title><rect width="210" height="104" rx="9"/><text x="15" y="29" class="node-name" style="font-size:${m.name.length > 17 ? 15 : 19}px">${e(m.name)}</text><text x="15" y="53" class="node-path">${e(
            m.path
              .replace("src/features/", "features/")
              .replace("src/", "")
              .replace(/^(.{23}).+$/, "$1…")
          )}</text><text x="15" y="81" class="node-meta">${m.files.length} files · ${m.annotated} annotated</text>${m.findings.length ? `<text x="184" y="29" class="node-issue">${m.findings.length}</text>` : ""}</g>`
      )
      .join("")
    const inbound = D.edges.filter((ed) => ed.to === selected.id),
      outbound = D.edges.filter((ed) => ed.from === selected.id)
    const connections = (list, dir) =>
      list.length
        ? list
            .sort((a, b) => b.count - a.count)
            .map(
              (ed) =>
                `<details class="edge-detail"><summary>${e(modules[dir === "out" ? ed.to : ed.from].name)}<span class="count-pill">${ed.count} refs</span></summary><button class="small-button" data-module="${dir === "out" ? ed.to : ed.from}">Explore module →</button>${ed.refs.map((r) => sourceButton(r.file, `<code>${e(r.file.replace("src/", ""))}:${r.line}</code><small>→ ${e(r.target.replace("src/", ""))}${r.typeOnly ? " · type" : ""}</small>`, r.line, r.line, "edge-ref")).join("")}</details>`
            )
            .join("")
        : '<p class="quiet-note">No cross-module imports in this snapshot.</p>'
    content.innerHTML =
      headings(
        "Walk the codebase.",
        "Select a module. Follow its imports, open its source, or trace a request through the system.",
        `<div class="stamp"><strong>${D.snapshot.annotatedCount}</strong>files with review annotations</div>`
      ) +
      `<div class="workspace-body"><div class="map-layout"><div><section class="map-panel" aria-label="Module import map"><div class="panel-toolbar"><span>Actual source imports · selected neighborhood</span><label>Lens <select id="map-lens"><option value="all" ${lens === "all" ? "selected" : ""}>Whole snapshot</option><option value="annotated" ${lens === "annotated" ? "selected" : ""}>Reviewed boundaries</option></select></label></div><div class="map-canvas"><svg viewBox="0 0 1040 880" role="group" aria-label="Interactive module dependencies"><defs><marker id="edge-marker" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#548879"/></marker></defs><text x="55" y="30" class="layer-label">ENTRY POINTS, FEATURES & INFRASTRUCTURE</text>${edges}${nodes}</svg></div><div class="map-legend"><span><i class="legend-line"></i>Source imports target</span><span><i class="legend-node"></i>Selected module</span><span>Amber count = contextual findings</span></div><div class="boundary-line">Parsed TypeScript imports, re-exports and literal dynamic imports. Type-only references are included. This is a dependency map, not a runtime call graph.</div></section><section class="workflow-launches"><div class="section-label">Follow a workflow</div><div class="workflow-pills">${D.workflows.map((w) => `<button class="workflow-pill" data-workflow="${w.id}">${e(w.title)}</button>`).join("")}</div></section></div><aside class="module-inspector"><div class="eyebrow">${e(selected.layer.toUpperCase())} / MODULE</div><h2>${e(selected.name)}</h2><span class="path">${e(selected.path)}</span><p>${e(selected.description)}</p><div class="stats-row"><div><strong>${selected.files.length}</strong><span>source files</span></div><div><strong>${selected.annotated}</strong><span>annotated</span></div><div><strong>${selected.findings.length}</strong><span>findings</span></div></div>${sourceButton(selected.entry, "Open entrypoint", 1, 1, "primary-button")}<div><div class="section-label">Imports</div>${connections(outbound, "out")}</div><div><div class="section-label">Imported by</div>${connections(inbound, "in")}</div><div><div class="section-label">Review annotations</div><div class="chips">${selected.findings.map(chip).join("") || '<p class="quiet-note">No actionable finding recorded.</p>'}</div></div></aside></div><section class="module-file-list"><div class="section-label">Inside ${e(selected.name)}</div><div class="file-grid">${selected.files
        .slice()
        .sort((a, b) => Number(files[b].marks.length > 0) - Number(files[a].marks.length > 0) || a.localeCompare(b))
        .map((path) =>
          sourceButton(
            path,
            `<code>${e(path.replace(selected.path + "/", ""))}</code><span class="status">${files[path].status === "unchanged" ? "" : files[path].status}</span>`
          )
        )
        .join("")}</div></section></div>`
  }
  function highlight(line) {
    const regex =
      /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|export|const|let|async|await|return|if|else|throw|new|class|function|type|interface|extends|try|catch|for|of|in|undefined|null|true|false|as|typeof|readonly)\b|\b\d+\b)/g
    let out = "",
      end = 0
    for (const m of line.matchAll(regex)) {
      out += e(line.slice(end, m.index))
      const value = m[0],
        cls =
          value.startsWith("//") || value.startsWith("/*")
            ? "comment"
            : /^["'`]/.test(value)
              ? "string"
              : /^\d/.test(value)
                ? "number"
                : "keyword"
      out += `<span class="token-${cls}">${e(value)}</span>`
      end = m.index + value.length
    }
    return out + e(line.slice(end))
  }
  function codeLines(f, mode = "source", from = 0, to = 0, compact = false) {
    const text = f.content
    return `<pre class="code-lines">${text
      .split("\n")
      .map((line, i) => {
        const n = i + 1
        const marks = mode === "source" ? f.marks.filter((a) => n >= a.from && n <= a.to) : []
        let code = mode === "diff" ? e(line) : highlight(line)
        const imp = mode === "source" ? f.imports.find((imp) => imp.line === n && imp.target) : null
        if (imp) {
          const raw = e(imp.spec)
          code = code.replace(
            raw,
            `<button class="code-jump" data-file="${e(imp.target)}" title="Open ${e(imp.target)}">${raw}</button>`
          )
        }
        const diffClass =
          mode === "diff"
            ? line.startsWith("+") && !line.startsWith("+++")
              ? "diff-add"
              : line.startsWith("-") && !line.startsWith("---")
                ? "diff-remove"
                : line.startsWith("@@")
                  ? "diff-header"
                  : ""
            : ""
        return `<span class="code-line ${marks.length ? "annotated" : ""} ${mode === "source" && n >= from && n <= to ? "highlight" : ""} ${diffClass}" ${compact ? "" : `id="source-line-${n}"`}><button class="line-number" data-file="${e(f.path)}" data-line="${n}" aria-label="${marks.length ? "Review annotation " + marks.map((a) => a.id).join(", ") + ", " : ""}line ${n}" ${mode !== "source" ? "disabled" : ""}>${n}</button>${code || " "}</span>`
      })
      .join("")}</pre>`
  }
  function renderSource() {
    const f = files[state.file] || files[lastFile]
    if (!f) return
    state.file = f.path
    lastFile = f.path
    const mode = ["source", "imports", "tests"].includes(state.mode) ? state.mode : "source"
    const from = Math.max(1, Number(state.line) || 1),
      to = Math.max(from, Number(state.to) || from)
    const fileFindings = [...new Set(f.marks.map((a) => a.id))]
    const readme = /\.md$/.test(f.path) && mode === "source"
    const imported = f.imports.filter((i) => i.target),
      external = f.imports.filter((i) => !i.target)
    let pane
    if (mode === "imports")
      pane = `<div class="document-source"><h2>Source dependencies</h2><p class="quiet-note">Names resolve against the pinned source tree. External packages and side-effect imports are listed separately.</p>${imported.map((i) => sourceButton(i.target, `<code>${e(i.spec)}</code><span class="count-pill">${e(i.typeOnly ? "type" : i.kind)}</span>`)).join("")}<h3 class="section-label">External / unresolved</h3>${external.map((i) => `<p><code>${e(i.spec)}</code> <span class="quiet-note">line ${i.line}</span></p>`).join("") || '<p class="quiet-note">None.</p>'}</div>`
    else if (mode === "tests")
      pane = `<div class="document-source"><h2>Related tests</h2><p class="quiet-note">Direct test importers and same-basename tests in this snapshot. This is navigation, not a coverage guarantee.</p>${f.testLinks.map((path) => sourceButton(path, `<code>${e(path)}</code>`)).join("") || '<p class="quiet-note">No indexed direct test or sibling test. See the historical verification ledger for review limits.</p>'}</div>`
    else
      pane = readme
        ? `<article class="document-source prose">${markdown(f.content, f.path)}</article>`
        : `<div class="code-scroll" id="source-scroll">${codeLines(f, mode, from, to)}</div>`
    content.innerHTML = `<div class="source-layout"><section class="source-pane"><div class="source-header"><strong>${e(f.path)}</strong><div class="source-meta">${f.status !== "unchanged" ? `<span class="tag">${f.status === "A" ? "Added" : f.status === "R" ? "Renamed" : f.status === "D" ? "Removed" : "Modified"}</span>` : '<span class="tag">Historical snapshot</span>'}${f.directives.includes("use client") ? '<span class="tag client">use client</span>' : ""}${f.directives.includes("use server") ? '<span class="tag server">use server</span>' : ""}${f.serverOnly ? '<span class="tag server">server-only</span>' : ""}</div></div><div class="source-tabs" aria-label="Source views">${[
      ["source", "Source"],
      ["imports", "Imports"],
      ["tests", "Related tests"]
    ]
      .map(
        ([key, label]) =>
          `<button data-source-mode="${key}" class="${mode === key ? "active" : ""}" aria-pressed="${mode === key}">${label}</button>`
      )
      .join(
        ""
      )}<span class="source-size">${f.content.split("\n").length} lines · ${D.snapshot.head.slice(0, 7)}</span></div>${pane}</section><aside class="source-inspector"><section class="inspector-block"><h2>At this boundary</h2><p class="quiet-note">${e(modules[f.module]?.description || "Repository context and verification material.")}</p>${fileFindings.length ? fileFindings.map((id) => `<button class="annotation-card" data-finding="${id}"><strong>${id} · ${e(findings[id].severity)}</strong><span>${e(findings[id].title)}</span><small>${e(f.marks.find((a) => a.id === id).label)}</small></button>`).join("") : '<p class="quiet-note">No actionable finding recorded for this file. Context files are not all independently audited.</p>'}<div class="chips">${D.workflows
      .filter((w) => w.steps.some((s) => s.file === f.path))
      .map((w) => `<button class="small-button" data-workflow="${w.id}">${e(w.title)}</button>`)
      .join("")}</div></section><section class="inspector-block"><h2>Symbols</h2>${
      f.symbols
        .filter((s) => s.kind !== "value" || s.line <= 40)
        .slice(0, 25)
        .map((s) =>
          sourceButton(
            f.path,
            `<span class="symbol-name">${e(s.name)}</span><span class="symbol-kind">${s.line}</span>`,
            s.line,
            s.end
          )
        )
        .join("") || '<p class="quiet-note">No declaration symbols in this file.</p>'
    }</section><section class="inspector-block"><h2>Imported by <span class="quiet-note">${f.importedBy.length}</span></h2>${f.importedBy.map((r) => sourceButton(r.path, `<code>${e(r.path.replace("src/", ""))}</code>`, r.line, r.line)).join("") || '<p class="quiet-note">No indexed source importer. Framework routes and tooling can be entrypoints.</p>'}</section></aside></div>`
    if (mode === "source" && !readme && from > 1)
      requestAnimationFrame(() => {
        const line = $("#source-line-" + from),
          scroll = $("#source-scroll")
        if (line && scroll) scroll.scrollTop = line.offsetTop - scroll.offsetTop - 90
      })
  }
  function openSearch() {
    showDialog("search-dialog")
    $("#global-search").value = ""
    renderSearch("")
    setTimeout(() => $("#global-search").focus(), 0)
  }
  function renderSearch(query) {
    const q = query.trim().toLowerCase()
    const results = []
    if (!q) {
      $("#search-results").innerHTML =
        '<div class="section-label" style="padding-left:12px">Useful starting points</div>' +
        D.workflows
          .map(
            (w) =>
              `<button class="search-result" data-workflow="${w.id}"><span class="result-kind">Workflow</span><strong>${e(w.title)}</strong><code>${e(w.description)}</code></button>`
          )
          .join("")
      return
    }
    for (const f of D.findings)
      if ((f.id + " " + f.title + " " + f.body).toLowerCase().includes(q))
        results.push({ kind: "Finding · " + f.severity, title: f.id + " / " + f.title, finding: f.id })
    for (const f of D.files) {
      if (f.path.toLowerCase().includes(q)) results.push({ kind: "File", title: f.path, file: f.path })
      for (const s of f.symbols)
        if (s.name.toLowerCase().includes(q))
          results.push({
            kind: "Symbol · " + s.kind,
            title: s.name,
            file: f.path,
            line: s.line,
            detail: f.path + ":" + s.line
          })
    }
    if (results.length < 55 && q.length >= 3)
      for (const f of D.files) {
        let hits = 0
        for (const [i, line] of f.content.split("\n").entries())
          if (line.toLowerCase().includes(q) && hits++ < 2) {
            results.push({
              kind: "Source line",
              title: f.path + ":" + (i + 1),
              file: f.path,
              line: i + 1,
              detail: line.trim()
            })
            if (results.length >= 75) break
          }
        if (results.length >= 75) break
      }
    $("#search-results").innerHTML = results.length
      ? `<div class="search-hint">${results.length > 55 ? "First 55 matches" : results.length + " matches"}</div>` +
        results
          .slice(0, 55)
          .map(
            (r) =>
              `<button class="search-result" ${r.finding ? `data-finding="${r.finding}"` : `data-file="${e(r.file)}" data-line="${r.line || 1}"`}><span class="result-kind">${e(r.kind)}</span><strong>${e(r.title)}</strong>${r.detail ? `<code>${e(r.detail)}</code>` : ""}</button>`
          )
          .join("")
      : '<p class="empty">No matches in the source snapshot. Try a shorter symbol or file name.</p>'
  }
  function renderView() {
    const previous = state
    let hash = location.hash.slice(1)
    if (hash.startsWith("view/"))
      hash =
        "view=" +
        ({ findings: "review", plan: "review", ideas: "review", coverage: "evidence", documents: "review" }[
          hash.slice(5)
        ] || hash.slice(5))
    if (hash.startsWith("finding/")) hash = "view=review&finding=" + encodeURIComponent(hash.slice(8))
    if (hash.startsWith("document/")) {
      const parts = hash.split("/")
      hash = "view=review&document=" + parts[1] + (parts[2] ? "&anchor=" + parts[2] : "")
    }
    const p = new URLSearchParams(hash)
    state = Object.fromEntries(p)
    if (!viewNames[state.view]) state.view = "map"
    $("#view-nav").innerHTML = Object.entries(viewNames)
      .map(
        ([key, name]) =>
          `<a href="#${new URLSearchParams(key === "source" ? { view: key, file: lastFile } : { view: key })}" ${state.view === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${name}</span></a>`
      )
      .join("")
    $("#breadcrumb").innerHTML =
      `CSK Hub <span>/</span> ${e(viewNames[state.view])}${state.file ? `<span>/</span><strong>${e(state.file.split("/").at(-1))}</strong>` : state.view === "map" ? `<span>/</span><strong>${e((modules[state.module] || modules.auth).name)}</strong>` : ""}`
    $("#view-tools").innerHTML =
      state.view === "source"
        ? `<button class="small-button" data-action="copy-path">Copy path</button>`
        : '<span class="quiet-note">Pinned to 930a2a5</span>'
    if (state.view === "map") renderMap()
    else if (state.view === "source") renderSource()
    else if (state.view === "traces") renderTraces()
    else if (state.view === "lab") renderLab()
    else if (state.view === "review") renderReview()
    else renderEvidence()
    renderTree()
    if (state.finding) openFinding(state.finding)
    if (state.document) openDocument(state.document, state.anchor || "")
    announce(viewNames[state.view] + " workspace opened")
    if (previous.view !== state.view || previous.file !== state.file || previous.scenario !== state.scenario)
      window.scrollTo({ top: 0, behavior: "instant" })
  }
  function snippet(path, from, to) {
    const f = files[path],
      last = Math.min(to, from + 20)
    return `<div class="snippet"><pre class="code-lines">${f.content
      .split("\n")
      .slice(from - 1, last)
      .map(
        (line, i) =>
          `<span class="code-line"><button class="line-number" data-file="${e(path)}" data-line="${from + i}" aria-label="Open source line ${from + i}">${from + i}</button>${highlight(line) || " "}</span>`
      )
      .join(
        ""
      )}</pre></div>${to > last ? `<div class="excerpt-note">Excerpt ${from}–${last} of declaration ${from}–${to}. Open source to follow the whole implementation.</div>` : ""}`
  }
  function renderTraces() {
    const w = D.workflows.find((w) => w.id === state.workflow) || D.workflows[0]
    const n = Math.max(0, Math.min(w.steps.length - 1, Number(state.step) || 0)),
      s = w.steps[n],
      f = files[s.file]
    const problems = [...new Set(w.steps.flatMap((s) => s.findings))]
    content.innerHTML =
      headings(
        "Follow a request.",
        w.description,
        `<span class="trace-counter">${String(n + 1).padStart(2, "0")} <span>/ ${String(w.steps.length).padStart(2, "0")}</span></span>`
      ) +
      `<div class="workspace-body"><div class="workflow-pills trace-select">${D.workflows.map((v) => `<button class="workflow-pill ${v.id === w.id ? "active" : ""}" data-workflow="${v.id}" aria-pressed="${v.id === w.id}">${e(v.title)}</button>`).join("")}</div><div class="trace-layout"><nav class="trace-lane" aria-label="Workflow steps">${w.steps.map((v, i) => `<button class="trace-step ${i === n ? "active" : i < n ? "visited" : ""}" data-step="${i}" data-trace="${w.id}" ${i === n ? 'aria-current="step"' : ""}><span class="step-number">${i < n ? "✓" : i + 1}</span><span><small>${e(modules[v.module]?.name || "Context")}</small><strong>${e(v.title)}</strong><code>${e(v.symbol || "lines " + v.line + "–" + v.end)}</code></span>${v.findings.length ? '<span class="step-dot" title="Review annotation">●</span>' : ""}</button>`).join("")}</nav><section class="trace-detail"><div class="trace-detail-head"><div><div class="eyebrow">${e(modules[s.module]?.layer || "source")} / ${e(modules[s.module]?.name || "Context")}</div><h2>${e(s.title)}</h2><p>${e(s.description)}</p></div><div class="chips">${s.findings.map(chip).join("")}</div></div><div class="trace-controls"><button class="secondary-button" data-step="${n - 1}" data-trace="${w.id}" ${n === 0 ? "disabled" : ""}>← Previous</button><span>Step ${n + 1} of ${w.steps.length}</span><button class="primary-button" data-step="${n + 1}" data-trace="${w.id}" ${n === w.steps.length - 1 ? "disabled" : ""}>Next →</button></div><div class="excerpt-header"><code>${e(s.file)}:${s.line}</code>${sourceButton(s.file, "Open full source ↗", s.line, s.end, "small-button")}</div>${snippet(s.file, s.line, s.end)}<div class="trace-boundaries"><div><div class="section-label">This file imports</div>${
        f.imports
          .filter((i) => i.target)
          .slice(0, 6)
          .map((i) =>
            sourceButton(
              i.target,
              `<code>${e(i.spec)}</code><span class="count-pill">${i.typeOnly ? "type" : i.kind}</span>`
            )
          )
          .join("") || '<p class="quiet-note">No indexed local imports.</p>'
      }</div><div><div class="section-label">Inspect the assumptions</div>${problems.map((id) => `<button class="compact-link" data-finding="${id}"><span>${id}</span><span>${e(findings[id].title)}</span></button>`).join("") || '<p class="quiet-note">No actionable finding on this sampled workflow.</p>'}${D.scenarios
        .filter((v) => v.workflow === w.id)
        .map(
          (v) => `<button class="small-button lab-launch" data-scenario="${v.id}">Experiment: ${e(v.title)} →</button>`
        )
        .join(
          ""
        )}</div></div></section></div><p class="boundary-line">Curated workflow through verified source symbols and explicit ranges. Steps include UI, guards, helpers and database declarations; they are not a captured runtime stack. Imports are derived from the snapshot.</p></div>`
  }
  const documents = Object.fromEntries(D.review.documents.map((d) => [d.file, d]))
  let saved = { pins: [], notes: {} },
    persistent = true
  try {
    const old = JSON.parse(localStorage.getItem("csk-review-atlas-2026-09-23") || "null")
    if (old && Array.isArray(old.pins) && old.notes && typeof old.notes === "object")
      saved = { pins: old.pins.filter((id) => findings[id]), notes: old.notes }
  } catch {
    persistent = false
  }
  const pinned = (id) => saved.pins.includes(id)
  function persist() {
    try {
      localStorage.setItem("csk-review-atlas-2026-09-23", JSON.stringify(saved))
    } catch {
      persistent = false
    }
  }
  function pinButton(id) {
    return `<button class="small-button" data-pin="${id}" aria-pressed="${pinned(id)}">${pinned(id) ? "★ Saved" : "☆ Save for later"}</button>`
  }
  function openDocument(file = "README.md", anchor = "") {
    const doc = documents[file]
    if (!doc) return
    $("#report-title").textContent = doc.title
    $("#report-content").innerHTML = markdown(doc.raw, "@review/" + file)
    showDialog("report-dialog")
    $("#report-dialog").scrollTop = 0
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }))
  }
  function openFinding(id) {
    const f = findings[id]
    if (!f) return
    const scenarios = D.scenarios.filter((s) => s.findings.includes(id)),
      workflow = D.workflows.find((w) => w.steps.some((s) => s.findings.includes(id)))
    $("#finding-content").innerHTML =
      `<div class="chips">${chip(id)}</div><h2 id="finding-title">${e(f.title)}</h2><div class="finding-meta"><span>${e(f.category)}</span><span>${e(f.confidence)}</span><span>Effort ${e(f.effort)}</span></div><div class="finding-actions">${scenarios.map((s) => `<button class="primary-button" data-scenario="${s.id}">Explore: ${e(s.title)}</button>`).join("")}${workflow ? `<button class="secondary-button" data-workflow="${workflow.id}">Trace the workflow</button>` : ""}${pinButton(id)}<button class="secondary-button" data-document="${f.source}" data-anchor="${f.anchor}">Canonical document ↗</button><button class="secondary-button" data-copy-finding="${id}">Copy brief</button></div><div class="section-label">Source evidence at ${D.snapshot.head.slice(0, 7)}</div>${f.annotations.map((a) => sourceButton(a.file, `<code>${e(a.file)}:${a.from}</code><span>${e(a.label)}</span>`, a.from, a.to)).join("")}${f.unindexed.length ? `<details class="unindexed"><summary>Other evidence locations (${f.unindexed.length})</summary><p class="quiet-note">Vendor source, directory inventories and other locations are retained as references in the report; they are not embedded as Git-pinned source.</p>${f.unindexed.map((p) => `<p><code>${e(p)}</code></p>`).join("")}</details>` : ""}<article class="prose">${markdown(f.body, "@review/" + f.source)}</article><section class="personal-notes"><label for="personal-note">Your note for later</label><textarea id="personal-note" data-note="${id}" placeholder="A question, implementation constraint or starting point…">${e(saved.notes[id] || "")}</textarea><p class="quiet-note">${persistent ? "Saved in this browser using the original viewer’s storage key." : "Storage unavailable; notes last for this session."} Export the shortlist to keep a portable copy. Saving does not mark a finding fixed.</p></section>`
    showDialog("finding-dialog")
    $("#finding-dialog").scrollTop = 0
  }
  const labs = window.createAtlasLabs({ e, sourceButton, D })
  function selectedScenario() {
    return D.scenarios.find((s) => s.id === state.scenario) || D.scenarios[0]
  }
  function renderExperiment() {
    const s = selectedScenario()
    $("#experiment-body").innerHTML = labs.render(s.id)
    $("#model-state").textContent = labs.model(s.id).fixed
      ? "PROPOSED RULE · ILLUSTRATIVE"
      : "CURRENT SOURCE · ILLUSTRATIVE"
  }
  function renderLab() {
    const s = selectedScenario()
    content.innerHTML =
      headings(
        "Explore the behavior.",
        "Change the inputs. Advance competing operations. Read the source behind each result."
      ) +
      `<div class="workspace-body"><div class="experiment-picker"><label for="scenario-picker">Choose an experiment</label><select id="scenario-picker">${D.scenarios.map((v) => `<option value="${v.id}" ${v.id === s.id ? "selected" : ""}>${e(v.title)} · ${v.findings.join(", ")}</option>`).join("")}</select><span>${D.scenarios.length} models · all 23 findings connected</span></div><div class="lab-layout"><nav class="experiment-list" aria-label="Behavior experiments">${D.scenarios.map((v) => `<button class="experiment-choice ${v.id === s.id ? "active" : ""}" data-scenario="${v.id}" aria-pressed="${v.id === s.id}"><small>${v.findings.join(" · ")}</small><strong>${e(v.title)}</strong><span>${e(v.description)}</span></button>`).join("")}</nav><section class="experiment-panel"><div class="experiment-head"><div><div class="eyebrow" id="model-state"></div><h2>${e(s.title)}</h2><p>${e(s.description)}</p></div><button class="small-button" data-lab-action="reset">Reset</button></div><div id="experiment-body"></div><div class="experiment-evidence"><div class="chips">${s.findings.map(chip).join("")}<button class="small-button" data-workflow="${s.workflow}">Follow workflow →</button></div><div class="section-label">Source behind this model</div>${s.findings
        .flatMap((id) => findings[id].annotations)
        .filter((a, i, list) => list.findIndex((b) => b.file === a.file && b.from === a.from) === i)
        .map((a) => sourceButton(a.file, `<code>${e(a.file)}:${a.from}</code><span>${e(a.label)}</span>`, a.from, a.to))
        .join(
          ""
        )}<p class="quiet-note">Illustrative models run only inside this explorer. They do not execute application code, send requests, change accounts, apply proposed fixes or validate the deployed system.</p></div></section></div></div>`
    renderExperiment()
  }
  function updateLab(field, value) {
    labs.change(selectedScenario().id, field, value)
    renderExperiment()
    document.querySelector(`[data-lab-field="${field}"]`)?.focus({ preventScroll: true })
  }
  function actInLab(key) {
    labs.act(selectedScenario().id, key)
    renderExperiment()
    announce("Experiment updated")
  }
  const reviewFilter = { query: "", severity: "all", category: "all", saved: false }
  function reviewRows() {
    const f = reviewFilter,
      q = f.query.toLowerCase(),
      rows = D.findings.filter(
        (v) =>
          (f.severity === "all" || v.severity === f.severity) &&
          (f.category === "all" || v.category === f.category) &&
          (!f.saved || pinned(v.id)) &&
          (!q || (v.id + " " + v.title + " " + v.summary).toLowerCase().includes(q))
      )
    $("#review-count").textContent = `${rows.length} of 23 findings${f.saved ? " · saved shortlist" : ""}`
    $("#review-results").innerHTML =
      rows
        .map(
          (v) =>
            `<article class="review-row"><div><div class="chips">${chip(v.id)}<span class="tag">${e(v.category)}</span></div><h2><button data-finding="${v.id}">${e(v.title)}</button></h2><p>${e(v.summary)}</p><div class="review-source-links">${v.annotations
              .slice(0, 2)
              .map((a) => sourceButton(a.file, `<code>${e(a.file)}:${a.from}</code>`, a.from, a.to))
              .join(
                ""
              )}</div></div><div class="review-row-actions">${pinButton(v.id)}<button class="secondary-button" data-scenario="${D.scenarios.find((s) => s.findings.includes(v.id)).id}">Explore behavior →</button></div></article>`
        )
        .join("") || '<p class="empty">No findings match these filters.</p>'
  }
  function renderReview() {
    content.innerHTML =
      headings(
        "Read the review in context.",
        "The original 23 findings remain canonical. Follow their source, compare assumptions, and keep notes for later.",
        `<button class="primary-button" data-action="export">Export shortlist ↓</button>`
      ) +
      `<div class="workspace-body"><div class="review-docs">${D.review.documents.map((d) => `<button class="workflow-pill" data-document="${d.file}">${e(d.title)}</button>`).join("")}</div><div class="review-controls"><label class="review-query"><span class="sr-only">Filter review findings</span><input id="review-query" type="search" value="${e(reviewFilter.query)}" placeholder="Filter IDs, titles or review summaries…"></label><label>Priority<select id="review-severity">${["all", "Blocker", "High", "Medium", "Low"].map((v) => `<option value="${v}" ${reviewFilter.severity === v ? "selected" : ""}>${v === "all" ? "All priorities" : v}</option>`).join("")}</select></label><label>Area<select id="review-category">${["all", ...new Set(D.findings.map((f) => f.category))].map((v) => `<option value="${v}" ${reviewFilter.category === v ? "selected" : ""}>${v === "all" ? "All areas" : e(v)}</option>`).join("")}</select></label><label class="check-control"><input id="review-saved" type="checkbox" ${reviewFilter.saved ? "checked" : ""}>Saved only</label></div><div class="section-label" id="review-count"></div><div id="review-results"></div><h2 class="section-title">Product decisions still awaiting ratification</h2><div class="decision-grid">${D.review.decisions.map((d) => `<article class="proof-card"><div class="eyebrow">PROPOSAL · NOT AN AGREEMENT</div><h3>${e(d.title)}</h3><p>${e(d.question)}</p><p>${e(d.recommendation)}</p><div class="chips">${d.findings.map(chip).join("")}</div></article>`).join("")}</div><button class="primary-button" data-document="access-control.md">Read the full policy design ↗</button></div>`
    reviewRows()
  }
  function renderEvidence() {
    const labels = {
      passed: "Passed in historical review",
      confirmed: "Confirmed in isolation",
      incomplete: "Incomplete",
      "not-run": "Not exercised"
    }
    content.innerHTML =
      headings(
        "Evidence, scope and limits.",
        "The September review’s verification ledger is preserved. Explorer models are not new application test results.",
        `<button class="primary-button" data-document="system-map.md">Full ledger ↗</button>`
      ) +
      `<div class="workspace-body"><div class="evidence-summary"><div><strong>23</strong><span>findings · 1 Blocker, 9 High</span></div><div><strong>${D.snapshot.fileCount}</strong><span>Git-pinned source/context files</span></div><div><strong>140</strong><span>non-architecture tests passed</span></div><div><strong>${D.workflows.length}</strong><span>source-verified workflows</span></div></div><div class="evidence-columns"><section><h2 class="section-title">What was verified</h2>${D.review.checks.map((c) => `<article class="proof-card"><span class="proof-status ${c.status}">${labels[c.status] || e(c.status)}</span><h3>${e(c.name.replaceAll("`", ""))}</h3><div class="prose">${markdown(c.detail)}</div></article>`).join("")}</section><section><h2 class="section-title">Snapshot contract</h2><article class="proof-card"><h3>Historical source, current presentation</h3><p>Code comes from <code>${D.snapshot.head}</code>, on the recorded branch <code>${D.snapshot.branch}</code>, September 23, 2026. It does not reflect subsequent fixes or new features.</p><p>${D.snapshot.annotatedCount} files carry line annotations. All 23 findings link to source and an illustrative model. Imports and symbols are parsed from Git; the workflow ordering is curated.</p><p>Source text, tests, domain documents and the checked-in environment example are embedded. Actual .env files, database contents, credentials, migrations and installed vendor source are excluded.</p><p>Type-only imports are included; computed imports and framework-discovered runtime connections may be absent. Finding-to-module associations include contextual ownership and can extend beyond a line annotation.</p><button class="small-button" data-document="handoff.md">Continue from the original handoff →</button></article><h2 class="section-title">Worth retaining</h2>${D.review.retained.map((r) => `<article class="proof-card"><h3>${e(r.title)}</h3><p>${e(r.detail)}</p></article>`).join("")}<h2 class="section-title">Coverage by area</h2><div class="coverage-accordions">${D.review.coverage.map((c) => `<details class="commit-card"><summary><strong>${e(c.area)}</strong><span>${e(c.depth)}</span></summary><div class="prose"><p>${inline(c.inspected)}</p><p><strong>Limits:</strong> ${inline(c.remaining)}</p></div></details>`).join("")}</div></section></div></div>`
  }
  function exportShortlist() {
    const text =
      `# CSK Hub review shortlist\n\nHistorical snapshot: ${D.snapshot.head} · ${D.snapshot.date}\nSelections and notes do not represent implemented resolutions.\n\n` +
      saved.pins
        .map((id) => {
          const f = findings[id]
          return `## ${id} — ${f.title}\n\nPriority: ${f.severity}\nCanonical: docs/reviews/2026-09-23-production-review/${f.source}#${f.anchor}\n\n${saved.notes[id] || ""}\n\n`
        })
        .join("")
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" })),
      link = document.createElement("a")
    link.href = url
    link.download = "csk-review-shortlist.md"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast("Shortlist exported.")
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button,[data-module]")
    if (!button) return
    if (button.dataset.close) {
      $("#" + button.dataset.close).close()
      return
    }
    if (button.dataset.document) {
      closeDialogs()
      openDocument(button.dataset.document, button.dataset.anchor || "")
      return
    }
    if (button.dataset.action === "export") {
      exportShortlist()
      return
    }
    if (button.dataset.pin) {
      const id = button.dataset.pin
      saved.pins = pinned(id) ? saved.pins.filter((v) => v !== id) : [...saved.pins, id]
      persist()
      if ($("#finding-dialog").open) openFinding(id)
      if (state.view === "review") reviewRows()
      return
    }
    if (button.dataset.action === "search") {
      openSearch()
      return
    }
    if (button.dataset.action === "report") {
      openDocument()
      return
    }
    if (button.dataset.action === "copy-path") {
      try {
        await navigator.clipboard.writeText(state.file || "")
        toast("Source path copied.")
      } catch {
        toast("Clipboard is unavailable in this browser.")
      }
      return
    }
    if (button.dataset.step !== undefined) {
      nav({ view: "traces", workflow: button.dataset.trace, step: button.dataset.step })
      return
    }
    if (button.dataset.labAction) {
      actInLab(button.dataset.labAction)
      return
    }
    if (button.dataset.file) {
      closeDialogs()
      openFile(
        button.dataset.file,
        Number(button.dataset.line) || 1,
        Number(button.dataset.to) || Number(button.dataset.line) || 1
      )
      return
    }
    if (button.dataset.module) {
      nav({ view: "map", module: button.dataset.module })
      return
    }
    if (button.dataset.finding) {
      $("#search-dialog").close()
      openFinding(button.dataset.finding)
      return
    }
    if (button.dataset.workflow) {
      closeDialogs()
      nav({ view: "traces", workflow: button.dataset.workflow, step: "0" })
      return
    }
    if (button.dataset.scenario) {
      closeDialogs()
      nav({ view: "lab", scenario: button.dataset.scenario })
      return
    }
    if (button.dataset.sourceMode) {
      nav({ ...state, mode: button.dataset.sourceMode })
      return
    }
    if (button.dataset.copyFinding) {
      const f = findings[button.dataset.copyFinding]
      try {
        await navigator.clipboard.writeText(`Snapshot ${D.snapshot.head}\n\n${f.id} — ${f.title}\n\n${f.body}`)
        toast("Implementation brief copied.")
      } catch {
        toast("Clipboard is unavailable. Select the report text to copy.")
      }
      return
    }
  })
  document.addEventListener("input", (event) => {
    if (event.target.dataset.note) {
      saved.notes[event.target.dataset.note] = event.target.value
      persist()
    }
    if (event.target.id === "review-query") {
      reviewFilter.query = event.target.value
      reviewRows()
    }
  })
  document.addEventListener("change", (event) => {
    if (event.target.id === "scenario-picker") {
      nav({ view: "lab", scenario: event.target.value })
      return
    }
    const reviewKeys = { "review-severity": "severity", "review-category": "category", "review-saved": "saved" }
    if (reviewKeys[event.target.id]) {
      reviewFilter[reviewKeys[event.target.id]] =
        event.target.type === "checkbox" ? event.target.checked : event.target.value
      reviewRows()
      return
    }
    if (event.target.dataset.labField) {
      updateLab(
        event.target.dataset.labField,
        event.target.type === "checkbox" ? event.target.checked : event.target.value
      )
      return
    }
    if (event.target.id === "map-lens") {
      lens = event.target.value
      renderMap()
    }
    if (event.target.id === "changed-only") {
      changedOnly = event.target.checked
      renderTree()
    }
    if (event.target.id === "include-tests") {
      includeTests = event.target.checked
      renderTree()
    }
  })
  $("#file-filter").addEventListener("input", (event) => {
    treeFilter = event.target.value
    renderTree()
  })
  $("#global-search").addEventListener("input", (event) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => renderSearch(event.target.value), 80)
  })
  document.addEventListener("keydown", (event) => {
    const typing = event.target.matches('input,textarea,select,[contenteditable="true"]')
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
      event.preventDefault()
      openSearch()
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-module][role=button]")) {
      event.preventDefault()
      nav({ view: "map", module: event.target.dataset.module })
    }
    if (event.key === "ArrowDown" && event.target.id === "global-search") {
      event.preventDefault()
      $("#search-results button")?.focus()
    }
  })
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return
      const r = dialog.getBoundingClientRect()
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
        dialog.close()
    })
  })
  window.addEventListener("hashchange", renderView)
  renderView()
})()
