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
    evidence: '<path d="M5 2h10l4 4v16H5ZM15 2v5h4M8 11h8M8 15h8M8 19h5"/>'
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
  const viewNames = { map: "Map", source: "Files", traces: "Traces", lab: "Lab", evidence: "Evidence" }
  let state = {},
    lens = "all",
    searchTimer,
    toastTimer
  let treeFilter = "",
    changedOnly = false,
    includeTests = false
  let lastFile = "src/features/messaging/sending/send-message.ts"
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
      if (url.startsWith("https://") || url.startsWith("#"))
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
        (!changedOnly || f.status !== "unchanged") &&
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
          return `<button class="file-row ${state.file === f.path ? "selected" : ""}" data-file="${e(f.path)}" title="${e(f.path)}"><span class="file-type">${/tsx$/.test(f.path) ? "tsx" : /\.md$/.test(f.path) ? "md" : f.path.split(".").at(-1)}</span><span class="file-name">${e(f.path.split("/").at(-1))}</span>${count ? `<span class="finding-count">${count}</span>` : ""}${f.status !== "unchanged" ? `<span class="change-letter">${f.status}</span>` : ""}</button>`
        })
        .join("")
    $("#file-tree").innerHTML = paths.length ? render(root) : '<p class="empty">No matching files.</p>'
    $("#snapshot-count").textContent = `${paths.length} files shown · ${D.snapshot.fileCount} embedded`
  }
  function headings(title, description, extra = "") {
    return `<div class="view-heading"><div><div class="eyebrow">${e(state.view === "source" ? "SOURCE SNAPSHOT" : "EXPLORE / " + viewNames[state.view].toUpperCase())}</div><h1>${e(title)}</h1><p>${e(description)}</p></div>${extra}</div>`
  }
  function renderMap() {
    const selected = modules[state.module] || modules.messaging
    const connected = new Set([selected.id])
    for (const edge of D.edges)
      if (edge.from === selected.id || edge.to === selected.id) {
        connected.add(edge.from)
        connected.add(edge.to)
      }
    const shown = D.modules.filter((m) => lens !== "changed" || m.changed || m.id === selected.id)
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
          `<g class="node ${m.id === selected.id ? "selected" : !connected.has(m.id) ? "dim" : ""}" transform="translate(${m.x},${m.y})" role="button" tabindex="0" aria-label="Explore ${e(m.name)}, ${m.files.length} files, ${m.findings.length} findings" aria-pressed="${m.id === selected.id}" data-module="${m.id}"><rect width="210" height="104" rx="9"/><text x="15" y="29" class="node-name">${e(m.name)}</text><text x="15" y="53" class="node-path">${e(m.path.replace("src/features/", "features/").replace("src/", ""))}</text><text x="15" y="81" class="node-meta">${m.files.length} files · ${m.changed} changed</text>${m.findings.length ? `<text x="184" y="29" class="node-issue">${m.findings.length}</text>` : ""}</g>`
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
        `<div class="stamp"><strong>${D.snapshot.changedCount}</strong>changed files in this atlas</div>`
      ) +
      `<div class="workspace-body"><div class="map-layout"><div><section class="map-panel" aria-label="Module import map"><div class="panel-toolbar"><span>Actual source imports · selected neighborhood</span><label>Lens <select id="map-lens"><option value="all" ${lens === "all" ? "selected" : ""}>Whole snapshot</option><option value="changed" ${lens === "changed" ? "selected" : ""}>Changed modules</option></select></label></div><div class="map-canvas"><svg viewBox="0 0 1040 700" role="group" aria-label="Interactive module dependencies"><defs><marker id="edge-marker" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#548879"/></marker></defs><text x="55" y="30" class="layer-label">ENTRY POINTS & FEATURES</text>${edges}${nodes}</svg></div><div class="map-legend"><span><i class="legend-line"></i>Source imports target</span><span><i class="legend-node"></i>Selected module</span><span>Amber count = review annotations</span></div><div class="boundary-line">Parsed TypeScript imports, re-exports and literal dynamic imports. Type-only references are included. This is a dependency map, not a runtime call graph.</div></section><section class="workflow-launches"><div class="section-label">Follow a workflow</div><div class="workflow-pills">${D.workflows.map((w) => `<button class="workflow-pill" data-workflow="${w.id}">${e(w.title)}</button>`).join("")}</div></section></div><aside class="module-inspector"><div class="eyebrow">${e(selected.layer.toUpperCase())} / MODULE</div><h2>${e(selected.name)}</h2><span class="path">${e(selected.path)}</span><p>${e(selected.description)}</p><div class="stats-row"><div><strong>${selected.files.length}</strong><span>source files</span></div><div><strong>${selected.changed}</strong><span>changed</span></div><div><strong>${selected.findings.length}</strong><span>annotations</span></div></div>${sourceButton(selected.entry, "Open entrypoint", 1, 1, "primary-button")}<div><div class="section-label">Imports</div>${connections(outbound, "out")}</div><div><div class="section-label">Imported by</div>${connections(inbound, "in")}</div><div><div class="section-label">Review annotations</div><div class="chips">${selected.findings.map(chip).join("") || '<p class="quiet-note">No actionable finding recorded.</p>'}</div></div></aside></div><section class="module-file-list"><div class="section-label">Inside ${e(selected.name)}</div><div class="file-grid">${selected.files
        .slice()
        .sort(
          (a, b) =>
            Number(files[b].status !== "unchanged") - Number(files[a].status !== "unchanged") || a.localeCompare(b)
        )
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
    const text =
      mode === "before"
        ? f.status === "unchanged"
          ? f.content
          : (f.before ?? "// This file did not exist at the base commit.")
        : mode === "diff"
          ? f.diff || "No changes to this file in the reviewed range."
          : f.status === "D"
            ? "// This file was removed at the reviewed head. Open At base or Diff."
            : f.content
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
    const mode = ["source", "before", "diff", "imports"].includes(state.mode)
      ? state.mode
      : f.status === "D"
        ? "before"
        : "source"
    const from = Math.max(1, Number(state.line) || 1),
      to = Math.max(from, Number(state.to) || from)
    const fileFindings = [...new Set(f.marks.map((a) => a.id))]
    const readme = /\.md$/.test(f.path) && mode === "source"
    const imported = f.imports.filter((i) => i.target),
      external = f.imports.filter((i) => !i.target)
    let pane
    if (mode === "imports")
      pane = `<div class="document-source"><h2>Source dependencies</h2><p class="quiet-note">Names resolve against the pinned source tree. External packages and side-effect imports are listed separately.</p>${imported.map((i) => sourceButton(i.target, `<code>${e(i.spec)}</code><span class="count-pill">${e(i.typeOnly ? "type" : i.kind)}</span>`)).join("")}<h3 class="section-label">External / unresolved</h3>${external.map((i) => `<p><code>${e(i.spec)}</code> <span class="quiet-note">line ${i.line}</span></p>`).join("") || '<p class="quiet-note">None.</p>'}</div>`
    else
      pane = readme
        ? `<article class="document-source prose">${markdown(f.content, f.path)}</article>`
        : `<div class="code-scroll" id="source-scroll">${codeLines(f, mode, from, to)}</div>`
    content.innerHTML = `<div class="source-layout"><section class="source-pane"><div class="source-header"><strong>${e(f.path)}</strong><div class="source-meta">${f.status !== "unchanged" ? `<span class="tag">${f.status === "A" ? "Added" : f.status === "R" ? "Renamed" : f.status === "D" ? "Removed" : "Modified"}</span>` : '<span class="tag">Context</span>'}${f.directives.includes("use client") ? '<span class="tag client">use client</span>' : ""}${f.directives.includes("use server") ? '<span class="tag server">use server</span>' : ""}${f.serverOnly ? '<span class="tag server">server-only</span>' : ""}</div></div><div class="source-tabs" aria-label="Source views">${[
      ["source", "Source"],
      ["before", "At base"],
      ["diff", "Diff"],
      ["imports", "Imports"]
    ]
      .map(
        ([key, label]) =>
          `<button data-source-mode="${key}" class="${mode === key ? "active" : ""}" aria-pressed="${mode === key}">${label}</button>`
      )
      .join(
        ""
      )}<span class="source-size">${(mode === "before" ? (f.before ?? f.content) : f.content).split("\n").length} lines · ${(mode === "before" ? D.snapshot.base : D.snapshot.head).slice(0, 7)}</span></div>${pane}</section><aside class="source-inspector"><section class="inspector-block"><h2>At this boundary</h2><p class="quiet-note">${e(modules[f.module]?.description || "Repository context and verification material.")}</p>${fileFindings.length ? fileFindings.map((id) => `<button class="annotation-card" data-finding="${id}"><strong>${id} · ${e(findings[id].severity)}</strong><span>${e(findings[id].title)}</span><small>${e(f.marks.find((a) => a.id === id).label)}</small></button>`).join("") : '<p class="quiet-note">No actionable finding recorded for this file. Context files are not all independently audited.</p>'}<div class="chips">${D.workflows
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
  function openFinding(id) {
    const f = findings[id]
    if (!f) return
    const scenario = D.scenarios.find((s) => s.finding === id),
      workflow = D.workflows.find((w) => w.steps.some((s) => s.findings.includes(id)))
    $("#finding-content").innerHTML =
      `<div class="chips">${chip(id)}</div><h2 id="finding-title">${e(f.title)}</h2><div class="finding-meta"><span>${e(f.axis)}</span><span>${e(f.confidence)}</span><span>Effort ${e(f.effort)}</span></div><div class="finding-actions">${scenario ? `<button class="primary-button" data-scenario="${scenario.id}">Explore behavior</button>` : ""}${workflow ? `<button class="secondary-button" data-workflow="${workflow.id}">Trace this workflow</button>` : ""}<button class="secondary-button" data-copy-finding="${id}">Copy implementation brief</button></div><div class="section-label">Source evidence</div>${f.annotations.map((a) => sourceButton(a.file, `<code>${e(a.file)}:${a.from}</code><span class="count-pill">${a.from}–${a.to}</span>`, a.from, a.to)).join("")}<article class="prose">${markdown(f.body)}</article>`
    showDialog("finding-dialog")
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
    const p = new URLSearchParams(location.hash.slice(1))
    state = Object.fromEntries(p)
    if (!viewNames[state.view]) state.view = "map"
    $("#view-nav").innerHTML = Object.entries(viewNames)
      .map(
        ([key, name]) =>
          `<a href="#${new URLSearchParams(key === "source" ? { view: key, file: lastFile } : { view: key })}" ${state.view === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${name}</span></a>`
      )
      .join("")
    $("#breadcrumb").innerHTML =
      `CSK Hub <span>/</span> ${e(viewNames[state.view])}${state.file ? `<span>/</span><strong>${e(state.file.split("/").at(-1))}</strong>` : state.view === "map" ? `<span>/</span><strong>${e((modules[state.module] || modules.messaging).name)}</strong>` : ""}`
    $("#view-tools").innerHTML =
      state.view === "source"
        ? `<button class="small-button" data-action="copy-path">Copy path</button>`
        : '<span class="quiet-note">Pinned to 031da8f</span>'
    if (state.view === "map") renderMap()
    else if (state.view === "source") renderSource()
    else if (state.view === "traces") renderTraces()
    else if (state.view === "lab") renderLab()
    else renderEvidence()
    renderTree()
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
      `<div class="workspace-body"><div class="workflow-pills trace-select">${D.workflows.map((v) => `<button class="workflow-pill ${v.id === w.id ? "active" : ""}" data-workflow="${v.id}" aria-pressed="${v.id === w.id}">${e(v.title)}</button>`).join("")}</div><div class="trace-layout"><nav class="trace-lane" aria-label="Workflow steps">${w.steps.map((v, i) => `<button class="trace-step ${i === n ? "active" : i < n ? "visited" : ""}" data-step="${i}" data-trace="${w.id}" ${i === n ? 'aria-current="step"' : ""}><span class="step-number">${i < n ? "✓" : i + 1}</span><span><small>${e(modules[v.module]?.name || "Context")}</small><strong>${e(v.title)}</strong><code>${e(v.symbol)}</code></span>${v.findings.length ? '<span class="step-dot" title="Review annotation">●</span>' : ""}</button>`).join("")}</nav><section class="trace-detail"><div class="trace-detail-head"><div><div class="eyebrow">${e(modules[s.module]?.layer || "source")} / ${e(modules[s.module]?.name || "Context")}</div><h2>${e(s.title)}</h2><p>${e(s.description)}</p></div><div class="chips">${s.findings.map(chip).join("")}</div></div><div class="trace-controls"><button class="secondary-button" data-step="${n - 1}" data-trace="${w.id}" ${n === 0 ? "disabled" : ""}>← Previous</button><span>Step ${n + 1} of ${w.steps.length}</span><button class="primary-button" data-step="${n + 1}" data-trace="${w.id}" ${n === w.steps.length - 1 ? "disabled" : ""}>Next →</button></div><div class="excerpt-header"><code>${e(s.file)}:${s.line}</code>${sourceButton(s.file, "Open full source ↗", s.line, s.end, "small-button")}</div>${snippet(s.file, s.line, s.end)}<div class="trace-boundaries"><div><div class="section-label">This file imports</div>${
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
        )}</div></div></section></div><p class="boundary-line">Curated workflow through verified source symbols. Steps include UI, guards, helpers and database declarations; they are not a captured runtime stack. Imports are derived from the snapshot.</p></div>`
  }
  const initialLab = {
    cache: { seconds: 90, active: false, fixed: false },
    deadlock: { step: 0, fixed: false },
    periods: { start: 3, same: false, fixed: false },
    confirmation: { loaded: "vacant", actual: "Erik", fixed: false, result: null },
    numbering: { start: 5, fixed: false },
    pagination: { before: 71, total: 120, sent: 0, fixed: false },
    allowance: { step: 0, fixed: false },
    reseed: { name: "Renamed Section", ran: false, fixed: false }
  }
  const lab = structuredClone(initialLab)
  const proposedControl = (m) =>
    `<label class="proposal-toggle"><input type="checkbox" data-lab-field="fixed" ${m.fixed ? "checked" : ""}>Explore proposed rule <span>Model only</span></label>`
  const outcome = (title, text, kind = "neutral") =>
    `<div class="outcome ${kind}" role="status"><span class="outcome-mark">${kind === "risk" ? "!" : kind === "good" ? "✓" : "↳"}</span><div><strong>${e(title)}</strong><p>${e(text)}</p></div></div>`
  const flow = (nodes) =>
    `<div class="state-flow">${nodes.map(([label, value, kind], i) => `${i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}<div class="state-node ${kind || ""}"><small>${e(label)}</small><strong>${e(value)}</strong></div>`).join("")}</div>`
  function labCache(m) {
    const cached = m.seconds < 300,
      allow = m.active || (!m.fixed && cached)
    return `<div class="lab-controls"><label>Elapsed after deactivation <output>${m.seconds} seconds</output><input type="range" min="0" max="360" step="15" value="${m.seconds}" data-lab-field="seconds"></label><label class="check-control"><input type="checkbox" data-lab-field="active" ${m.active ? "checked" : ""}>Sender remains active</label>${proposedControl(m)}</div><div class="time-track"><span>Cache created / revoked</span><div class="time-rule"><i style="left:${(m.seconds / 360) * 100}%"></i><b style="left:${(300 / 360) * 100}%">300s expiry</b></div><span>360s</span></div>${flow(
      [
        ["Cookie cache", cached ? "Within 300s" : "Expired", cached ? "amber" : ""],
        ["Identity guard", m.fixed ? "Fresh lookup" : cached ? "Cached identity" : "Fresh lookup"],
        [
          "Sender authority",
          m.active ? "Active" : allow ? "Revoked · unchecked" : "Revoked · denied",
          allow && !m.active ? "amber" : ""
        ],
        ["Send boundary", allow ? "Can proceed" : "Refused", allow && !m.active ? "amber" : "green"]
      ]
    )}${outcome(allow ? (m.active ? "Active sender proceeds" : "Cached sender still proceeds") : "Authoritative request is refused", m.active ? "Normal membership and recipient checks still apply." : allow ? "The current guard can return revoked identity. The recipient check does not re-establish the sender’s authority." : "The model returns no fresh session after revocation. This blocks entry to the protected command.", allow && !m.active ? "risk" : "good")}<p class="quiet-note">Assumptions: cache filled immediately before revocation, no refresh, recipient active, valid membership, successful persistence. The installed-library cache behavior was reproduced. Full application replay and deactivation races remain unverified. A fresh request check alone does not model the proposed transactional sender lock.</p>`
  }
  function labDeadlock(m) {
    const current = [
      ["Ready", "Ready", "No locks held."],
      ["Holder row locked", "Ready", "Replacement locks the incumbent row."],
      ["Holder row locked", "User lock held", "Departure acquires the incumbent’s advisory lock."],
      ["Holder row locked", "Waiting for holder row", "Departure updates the holding and waits for replacement."],
      [
        "Waiting for User lock",
        "Waiting for holder row",
        "Replacement requests the User lock. Each waits for the other."
      ]
    ]
    const proposed = [
      [
        "Ready",
        "Ready",
        "Illustrative common order: User lock, then holder row. The complete office/catalogue protocol still needs design."
      ],
      ["User lock held", "Ready", "Replacement acquires the User lock first."],
      ["User + holder row held", "Ready", "Replacement now locks the holder row."],
      [
        "User + holder row held",
        "Waiting for User lock",
        "Departure waits before taking the holder row. No cycle exists."
      ],
      ["Committed; locks released", "User lock available", "Replacement commits; departure resumes and rechecks state."]
    ]
    const [a, b, why] = (m.fixed ? proposed : current)[m.step]
    return `<div class="lab-controls">${proposedControl(m)}<div class="step-controls"><button class="secondary-button" data-lab-action="back" ${m.step === 0 ? "disabled" : ""}>← Back</button><span>Interleaving ${m.step} / 4</span><button class="primary-button" data-lab-action="advance" ${m.step === 4 ? "disabled" : ""}>Advance transaction →</button></div></div><div class="transaction-grid"><div class="transaction-card"><div class="eyebrow">TRANSACTION A</div><h3>Replace holder</h3><code>replacePositionHolder</code><div class="lock-state ${m.step === 4 && !m.fixed ? "waiting" : ""}">${e(a)}</div><div class="lock-order">${m.fixed ? "User → holder row" : "Holder row → User"}</div></div><div class="transaction-card"><div class="eyebrow">TRANSACTION B</div><h3>End Membership</h3><code>endMembership</code><div class="lock-state ${m.step >= 3 ? "waiting" : ""}">${e(b)}</div><div class="lock-order">User → holder row</div></div></div>${outcome(m.step === 4 && !m.fixed ? "A wait cycle exists" : m.fixed && m.step === 4 ? "Transactions can serialize" : "Advance the lock schedule", why, m.step === 4 && !m.fixed ? "risk" : m.fixed && m.step === 4 ? "good" : "neutral")}<p class="quiet-note">This schedule is source-derived, not a recorded PostgreSQL deadlock. PostgreSQL would abort one transaction in the cycle. The proposed order illustrates cycle prevention for these two resources; it is not a verified complete lock protocol.</p>`
  }
  function labPeriods(m) {
    const overlaps = m.start < 6,
      refused = overlaps && (m.same || m.fixed)
    return `<div class="lab-controls"><label>Incoming start month <output>${["", "January", "February", "March", "April", "May", "June", "July", "August", "September"][m.start]}</output><input type="range" min="1" max="9" value="${m.start}" data-lab-field="start"></label><label class="check-control"><input type="checkbox" data-lab-field="same" ${m.same ? "checked" : ""}>Incoming holder is the same User</label>${proposedControl(m)}</div><div class="period-chart"><div class="month-labels">${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((v) => `<span>${v}</span>`).join("")}</div><div class="period-row"><span>Erik · prior</span><div class="period-rail"><div class="period-bar prior" style="left:0;width:${(5 / 12) * 100}%">Jan → Jun</div></div></div><div class="period-row"><span>${m.same ? "Erik" : "Sara"} · incoming</span><div class="period-rail"><div class="period-bar ${overlaps ? "overlap" : "next"}" style="left:${((m.start - 1) / 12) * 100}%;width:${((13 - m.start) / 12) * 100}%">${m.start} → open</div></div></div></div><div class="model-query"><code>${m.fixed ? "WHERE groupId = G AND positionId = P" : "WHERE groupId = G AND positionId = P AND userId = incomingUser"}</code><p>${m.fixed ? "All holders of the office participate in the interval check." : m.same ? "The prior row is considered because the User matches." : "The prior row is excluded because its User differs."}</p></div>${outcome(refused ? "Overlap refused" : overlaps ? "Overlapping history accepted" : "Adjacent or later period accepted", refused ? "The new interval starts before the prior one ends." : overlaps ? "A different User bypasses the current user-scoped conflict query. The active-row unique index does not cover closed history." : "The prior interval ends at the start of June. Starting on that boundary preserves the documented adjacency convention.", overlaps && !refused ? "risk" : "good")}<p class="quiet-note">Toy office and dates; prior period [Jan 1, Jun 1), incoming period [selected month 1, open). Other module prerequisites are assumed valid. Cross-User overlap was reproduced in disposable PostgreSQL. Proposed serialization still needs implementation.</p>`
  }
  function labConfirmation(m) {
    const options = (value) =>
      ["vacant", "Erik", "Olof"]
        .map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v === "vacant" ? "Vacant" : v}</option>`)
        .join("")
    return `<div class="lab-controls"><label>Database holder at submit<select data-lab-field="actual">${options(m.actual)}</select></label>${proposedControl(m)}<button class="secondary-button" data-lab-action="capture">Reload page snapshot</button></div><div class="transaction-grid"><div class="transaction-card"><div class="eyebrow">ADMIN’S PAGE SNAPSHOT</div><h3>${m.loaded === "vacant" ? "Assign Sara" : `Replace ${e(m.loaded)} with Sara`}</h3><p>${m.loaded === "vacant" ? "Page shows vacancy. No incumbent departure is described." : `Confirmation describes ending ${e(m.loaded)}’s holding.`}</p><code>expected = ${e(m.loaded)}</code></div><div class="transaction-card"><div class="eyebrow">DATABASE AT SUBMIT</div><h3>${m.actual === "vacant" ? "Position is vacant" : `${e(m.actual)} holds the Position`}</h3><p>Another Admin may have changed this after page load.</p><code>actual = ${e(m.actual)}</code></div></div><button class="primary-button simulate-submit" data-lab-action="submit">Preview simulated command result →</button>${m.result ? outcome(m.result.title, m.result.text, m.result.kind) : outcome("The page is stale when these values differ.", "Change the database holder, then preview submission. The model keeps the page’s original confirmation until you reload it.")}<p class="quiet-note">The cards preserve the inputs at submission; the result predicts which holding would change. The current transport carries no expected holder. A proposed conflict check must compare a holding revision, including vacancy, inside the serialized replacement command; person identity alone is insufficient for end-and-restart cases.</p>`
  }
  function labNumbering(m) {
    const list = (start) =>
      `<ol start="${start}"><li>Warm up together</li><li>Rehearse the entrance</li><li>Review the ending</li></ol>`
    return `<div class="lab-controls"><label>Ordered list starts at<select data-lab-field="start">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${m.start === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>${proposedControl(m)}</div><div class="reader-comparison"><div class="reader-card"><div class="eyebrow">AUTHOR / EDITOR</div>${list(m.start)}<code>attrs: { start: ${m.start} }</code></div><div class="reader-card"><div class="eyebrow">PUBLISHED / SERVER READER</div>${list(m.fixed ? m.start : 1)}<code>${e(m.fixed ? `<ol start={${m.start}}>` : "<ol>")}</code></div></div>${outcome(m.start !== 1 && !m.fixed ? "Numbering changes at publication" : "Numbering agrees", m.fixed ? "The proposed mapping retains the supported start attribute." : m.start === 1 ? "The default hides the mismatch. Try a start number greater than one." : "The document retains the attribute, but the reader node mapping drops it.", m.start !== 1 && !m.fixed ? "risk" : "good")}<p class="quiet-note">These are native browser lists illustrating the renderer mismatch; this explorer does not embed Tiptap or execute the app renderer. The missing server attribute was separately reproduced. Actual styling and all attribute bounds belong to the application contract.</p>`
  }
  function labPagination(m) {
    const upper = m.before ? m.before - 1 : m.total,
      lower = Math.max(1, upper - 49),
      visible = m.sent >= lower && m.sent <= upper
    return `<div class="lab-controls"><label>Displayed timeline<select data-lab-field="before"><option value="0" ${!m.before ? "selected" : ""}>Latest</option><option value="71" ${m.before === 71 ? "selected" : ""}>Older · before=71</option><option value="21" ${m.before === 21 ? "selected" : ""}>Oldest · before=21</option></select></label>${proposedControl(m)}<button class="primary-button" data-lab-action="send">Send simulated Message →</button></div><div class="timeline-model"><div class="timeline-top"><code>${m.before ? "?before=" + m.before : "Canonical latest route"}</code><span>Showing #${lower}–#${upper} · total ${m.total}</span></div><div class="timeline-items">${Array.from(
      { length: Math.min(6, upper - lower + 1) },
      (_, i) => upper - Math.min(5, upper - lower) + i
    )
      .map(
        (n) =>
          `<div class="timeline-message ${n === m.sent ? "new-message" : ""}"><span>#${n}</span><p>${n === m.sent ? "Your newly sent Message" : "An existing Message in this window"}</p></div>`
      )
      .join(
        ""
      )}</div><div class="timeline-caption">Sample of the current ${upper - lower + 1}-Message window. Query: ${m.before ? `sequence &lt; ${m.before}` : "latest 50 sequences"}.</div></div>${m.sent ? outcome(visible ? "Your sent Message is visible" : "Sent successfully; absent from this window", visible ? "The current window contains the new sequence." : `Sequence #${m.sent} was appended, but revalidation retains before=${m.before}. Scrolling cannot change the query boundary.`, visible ? "good" : "risk") : outcome("Send from an older window.", "Appending changes persistence. The current success handler revalidates and scrolls the same route; the proposed navigation opens the latest window.")}<p class="quiet-note">Toy sequential Conversation with 120 initial Messages, no concurrent senders or deletions. This models the source query and URL behavior. The original application’s history-send flow has not been browser-reproduced.</p>`
  }
  function labAllowance(m) {
    const current = [
      ["Allowed", "None", "Ready", "Ready", "Start with a Board allowance and no holding."],
      [
        "Allowed",
        "None",
        "Allowance read: yes",
        "Ready",
        "Assignment validates the allowance without the Position lock."
      ],
      [
        "Removed",
        "None",
        "Paused before insert",
        "Revocation committed",
        "Revocation locks Position, sees no committed holding, and removes the allowance."
      ],
      [
        "Removed",
        "Sara",
        "Assignment committed",
        "Revocation committed",
        "The FK checks Position identity, not the missing allowance."
      ]
    ]
    const proposed = [
      ["Allowed", "None", "Ready", "Ready", "Illustrative shared Position-lock protocol."],
      [
        "Allowed",
        "None",
        "Position locked; allowance read",
        "Ready",
        "Assignment holds the coordinating lock before validation."
      ],
      ["Allowed", "None", "Paused before insert", "Waiting on Position", "Revocation cannot validate concurrently."],
      [
        "Allowed",
        "Sara",
        "Assignment committed",
        "Revocation refused",
        "After the lock is released, revocation observes the holding."
      ]
    ]
    const [allowance, holder, a, b, why] = (m.fixed ? proposed : current)[m.step]
    return `<div class="lab-controls">${proposedControl(m)}<div class="step-controls"><button class="secondary-button" data-lab-action="back" ${!m.step ? "disabled" : ""}>← Back</button><span>Interleaving ${m.step} / 3</span><button class="primary-button" data-lab-action="advance" ${m.step === 3 ? "disabled" : ""}>Advance transaction →</button></div></div>${flow(
      [
        ["Board allowance", allowance, allowance === "Removed" ? "amber" : ""],
        ["Board holder", holder, holder !== "None" && allowance === "Removed" ? "amber" : ""]
      ]
    )}<div class="transaction-grid"><div class="transaction-card"><div class="eyebrow">ASSIGNMENT</div><h3>${e(a)}</h3></div><div class="transaction-card"><div class="eyebrow">CATALOGUE UPDATE</div><h3>${e(b)}</h3></div></div>${outcome(m.step === 3 && !m.fixed ? "A forbidden holding can persist" : m.step === 3 ? "Invariant remains intact" : "Walk the race schedule", why, m.step === 3 && !m.fixed ? "risk" : m.step === 3 ? "good" : "neutral")}<p class="quiet-note">A source-derived possible schedule, not a controlled database reproduction. The alternate winner is valid too: revocation commits first and assignment is refused. A complete protocol must coordinate this Position lock with office, User and holder locks.</p>`
  }
  function labReseed(m) {
    const name = m.name.trim() || "MKT1",
      duplicates = m.ran && name !== "MKT1" && !m.fixed
    return `<div class="lab-controls"><label>Rename the T1 Section<input type="text" maxlength="50" value="${e(m.name)}" data-lab-field="name"></label>${proposedControl(m)}<button class="primary-button" data-lab-action="seed">Rerun simulated reference data →</button></div><div class="section-model">${[[name, "T1"], ["MKT2", "T2"], ["MKB1", "B1"], ["MKB2", "B2"], ...(duplicates ? [["MKT1", "T1"]] : [])].map(([n, v], i) => `<div class="section-card ${i === 4 ? "duplicate" : ""}"><small>MK / Section</small><strong>${e(n)}</strong><code>Voice ${v}</code>${i === 4 ? "<span>Created by rerun</span>" : ""}</div>`).join("")}</div><div class="model-query"><code>${m.fixed ? "Match established Section by Choir + Voice; validate invariants" : 'Find active Section with name = "MKT1"'}</code><p>${name === "MKT1" ? "The bootstrap name still matches." : m.fixed ? "The same reference identity survives the supported rename." : "The renamed Section no longer matches the lookup name."}</p></div>${outcome(duplicates ? "Five Sections; two sing T1" : m.ran ? "Four Sections retained" : "Rename, then rerun.", duplicates ? "Ordinary Admin maintenance makes the name-based seed create an extra Section." : m.ran ? "The toy rerun adds no Section. A production reconciliation contract must also reject ambiguity and preserve administrator intent." : "The current operational lookup treats display names as reference identity.", duplicates ? "risk" : m.ran ? "good" : "neutral")}<p class="quiet-note">Rename + rerun was reproduced in disposable PostgreSQL. The proposed model assumes an unambiguous Choir/Voice match; it does not solve Choir renames or catalogue customization. No ops command executes from this page.</p>`
  }
  const experiments = {
    cache: labCache,
    deadlock: labDeadlock,
    periods: labPeriods,
    confirmation: labConfirmation,
    numbering: labNumbering,
    pagination: labPagination,
    allowance: labAllowance,
    reseed: labReseed
  }
  function selectedScenario() {
    return D.scenarios.find((s) => s.id === state.scenario) || D.scenarios[0]
  }
  function renderExperiment() {
    const s = selectedScenario()
    $("#experiment-body").innerHTML = experiments[s.id](lab[s.id])
    $("#model-state").textContent = lab[s.id].fixed ? "PROPOSED RULE · ILLUSTRATIVE" : "CURRENT SOURCE · ILLUSTRATIVE"
  }
  function renderLab() {
    const s = selectedScenario(),
      f = findings[s.finding]
    content.innerHTML =
      headings(
        "Explore the behavior.",
        "Change inputs and advance competing operations. Each model links its assumptions to the exact reviewed source."
      ) +
      `<div class="workspace-body"><div class="lab-layout"><nav class="experiment-list" aria-label="Behavior experiments">${D.scenarios.map((v) => `<button class="experiment-choice ${v.id === s.id ? "active" : ""}" data-scenario="${v.id}" aria-pressed="${v.id === s.id}"><small>${v.finding}</small><strong>${e(v.title)}</strong><span>${e(v.description)}</span></button>`).join("")}</nav><section class="experiment-panel"><div class="experiment-head"><div><div class="eyebrow" id="model-state"></div><h2>${e(s.title)}</h2><p>${e(s.description)}</p></div><button class="small-button" data-lab-action="reset">Reset</button></div><div id="experiment-body"></div><div class="experiment-evidence"><div class="chips">${chip(s.finding)}<button class="small-button" data-workflow="${s.workflow}">Follow workflow →</button></div><div class="section-label">Read the source behind this model</div>${f.annotations.map((a) => sourceButton(a.file, `<code>${e(a.file)}:${a.from}</code><span>${e(a.label)}</span>`, a.from, a.to)).join("")}</div></section></div></div>`
    renderExperiment()
  }
  function updateLab(field, value) {
    const s = selectedScenario(),
      m = lab[s.id]
    m[field] = ["seconds", "step", "start", "before"].includes(field) ? Number(value) : value
    if (s.id === "confirmation") m.result = null
    if (field === "fixed" && ["deadlock", "allowance"].includes(s.id)) m.step = 0
    if (s.id === "reseed" && field === "name") m.ran = false
    // Preserve the control being dragged/typed. Replace on change, so focus stays stable while editing.
    renderExperiment()
    const control = document.querySelector(`[data-lab-field="${field}"]`)
    control?.focus({ preventScroll: true })
  }
  function actInLab(action) {
    const s = selectedScenario(),
      m = lab[s.id]
    if (action === "reset") {
      lab[s.id] = structuredClone(initialLab[s.id])
      renderExperiment()
      return
    }
    if (action === "advance") m.step = Math.min(s.id === "deadlock" ? 4 : 3, m.step + 1)
    if (action === "back") m.step = Math.max(0, m.step - 1)
    if (action === "capture") {
      m.loaded = m.actual
      m.result = null
    }
    if (action === "submit") {
      const conflict = m.actual !== m.loaded
      m.result =
        m.fixed && conflict
          ? {
              title: "Conflict; fresh confirmation required",
              text: "The expected holder state differs. No holding is changed in the proposed model.",
              kind: "good"
            }
          : {
              title: m.actual === "vacant" ? "Sara assigned" : `${m.actual} replaced by Sara`,
              text: conflict
                ? "The current command acts on the actual incumbent, although the stale page confirmed something else."
                : "The simulated handover matches the page-loaded confirmation.",
              kind: conflict ? "risk" : "good"
            }
    }
    if (action === "send") {
      m.sent = ++m.total
      if (m.fixed) m.before = 0
    }
    if (action === "seed") m.ran = true
    renderExperiment()
    announce("Experiment advanced: " + s.title)
  }
  function renderEvidence() {
    const proofs = [
      [
        "Disposable PostgreSQL",
        "Confirmed",
        "Rename + reference-data rerun created a fifth Section. Different Users were accepted with overlapping historical holdings.",
        "STD-1",
        "STD-2"
      ],
      [
        "Installed Better Auth",
        "Cache premise confirmed",
        "A banned User’s signed cache still resolved a session; cache bypass returned null. Full application replay remains unverified.",
        "PROD-1"
      ],
      [
        "Renderer comparison",
        "Confirmed",
        "Editor ordered list began at 5; server reader emitted no start attribute.",
        "SPEC-01"
      ],
      [
        "Source interleavings",
        "Strongly probable",
        "Catalogue revocation, lock inversion and stale confirmation were traced in source. Controlled concurrent reproductions remain required.",
        "STD-3",
        "STD-4",
        "SPEC-02"
      ],
      [
        "Messaging transport",
        "Mixed confidence",
        "History cursor behavior is source-probable. Missing unexpected-error logging is confirmed in the adapters.",
        "PROD-2",
        "PROD-3"
      ]
    ]
    content.innerHTML =
      headings(
        "Evidence, scope and limits.",
        "Keep the source snapshot, review conclusions and illustrative experiments distinct.",
        `<button class="primary-button" data-action="report">Read canonical report ↗</button>`
      ) +
      `<div class="workspace-body"><div class="evidence-summary"><div><strong>304</strong><span>tests passed · DB run</span></div><div><strong>396</strong><span>files linted</span></div><div><strong>9</strong><span>canonical findings</span></div><div><strong>0</strong><span>atlas parse errors</span></div></div><div class="evidence-columns"><section><h2 class="section-title">How we know</h2>${proofs.map(([title, status, text, ...ids]) => `<article class="proof-card"><span class="proof-status">${e(status)}</span><h3>${e(title)}</h3><p>${e(text)}</p><div class="chips">${ids.map(chip).join("")}</div></article>`).join("")}<article class="proof-card"><h3>Verification boundary</h3><p>Application lint and the full database-backed suite passed. Source-only TypeScript passed. Normal typechecking encountered stale .next route validators. The application build and application browser flows were not run in the read-only review.</p><p>This explorer has its own browser verification; that does not validate the underlying application behavior.</p></article></section><section><h2 class="section-title">Walk the commit history</h2><p class="quiet-note">Nine commits after the supplied base. File links open the reviewed head snapshot, not that commit’s intermediate version.</p><div class="commit-history">${D.commits.map((c) => `<details class="commit-card"><summary><code>${c.sha.slice(0, 7)}</code><strong>${e(c.title)}</strong><span>${c.files.length} indexed files</span></summary><div>${c.files.map((path) => sourceButton(path, `<code>${e(path)}</code>`)).join("") || '<p class="quiet-note">No embedded source paths in this commit.</p>'}</div></details>`).join("")}</div><article class="proof-card"><div class="eyebrow">SNAPSHOT CONTRACT</div><h3>A portable codebase atlas</h3><p>${D.snapshot.fileCount} pinned files, including tests and domain documentation. ${D.snapshot.changedCount} changed paths are embedded; migrations and other out-of-scope paths account for the difference from the 200-path review range.</p><p>The source map parses imports, re-exports and literal dynamic imports; type-only edges are included. Framework discovery and nonliteral imports may create runtime links absent from this map.</p><p>Context files help navigation and were not all independently audited. The snapshot excludes environment files and live database contents.</p><code>${D.snapshot.base}<br>↓<br>${D.snapshot.head}</code></article></section></div></div>`
  }
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button,[data-module]")
    if (!button) return
    if (button.dataset.close) {
      $("#" + button.dataset.close).close()
      return
    }
    if (button.dataset.action === "search") {
      openSearch()
      return
    }
    if (button.dataset.action === "report") {
      $("#report-content").innerHTML = markdown(D.report)
      showDialog("report-dialog")
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
  document.addEventListener("change", (event) => {
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
