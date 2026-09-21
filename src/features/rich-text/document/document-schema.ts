import { type Extensions, getSchema, type JSONContent } from "@tiptap/core"
import { Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model"
import { baseFeatures } from "./features"
import { safeLinkHref } from "./safe-link-href"

/** A document in the shape the editor writes and a consumer stores. */
export type RichTextDocument = JSONContent

/**
 * What a consumer says a document may contain, and everything the module derives from
 * that: the extensions to build an editor from, and the normaliser that turns whatever a
 * browser submitted into a document this schema would itself have produced.
 */
export type DocumentSchema = {
  extensions: Extensions
  /** The heading levels allowed, in ascending order; empty when headings are not. */
  headingLevels: readonly number[]
  /** A stored document from an untrusted value, or null when there is no document in it. */
  normalize: (value: unknown) => RichTextDocument | null
  /** The same, from the JSON string a form submits. */
  parse: (json: string) => RichTextDocument | null
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function configuredHeadingLevels(extensions: Extensions): number[] {
  const heading = extensions.find((extension) => extension.name === "heading")
  const levels = (heading?.options as { levels?: unknown } | undefined)?.levels
  if (!Array.isArray(levels)) return []
  return levels.filter((level): level is number => Number.isInteger(level)).sort((a, b) => a - b)
}

function nearestLevel(levels: readonly number[], requested: unknown): number {
  const wanted = Number(requested)
  if (!Number.isFinite(wanted)) return levels[0] ?? 1
  return levels.reduce((best, level) => (Math.abs(level - wanted) < Math.abs(best - wanted) ? level : best))
}

function createNormalizer(schema: Schema, headingLevels: readonly number[]) {
  /**
   * Attribute values the schema cannot police on its own. A type absent here keeps
   * whatever attributes it declares.
   */
  const attributeRules: Record<string, (attrs: UnknownRecord) => UnknownRecord> = {
    heading: (attrs) => ({ ...attrs, level: nearestLevel(headingLevels, attrs.level) })
  }

  /** Keep the attributes the node or mark actually declares, then apply its own rule. */
  function pruneAttrs(type: string, declared: object | null | undefined, attrs: unknown): UnknownRecord | undefined {
    if (!declared) return undefined

    const source = isRecord(attrs) ? attrs : {}
    const kept: UnknownRecord = {}
    for (const name of Object.keys(declared)) {
      if (name in source) kept[name] = source[name]
    }

    const ruled = attributeRules[type]?.(kept) ?? kept
    return Object.keys(ruled).length > 0 ? ruled : undefined
  }

  function pruneMarks(marks: unknown): JSONContent["marks"] {
    if (!Array.isArray(marks)) return undefined

    const kept = marks.flatMap((mark) => {
      if (!isRecord(mark) || typeof mark.type !== "string") return []

      const markType = schema.marks[mark.type]
      if (!markType) return []

      const attrs = pruneAttrs(mark.type, markType.spec.attrs, mark.attrs)
      // A link with nowhere safe to point is not a link; the words it wrapped survive.
      if (mark.type === "link" && !safeLinkHref(attrs?.href)) return []

      return [attrs ? { type: mark.type, attrs } : { type: mark.type }]
    })

    return kept.length > 0 ? kept : undefined
  }

  /**
   * Zero or more nodes, because a node the schema does not know is replaced by its own
   * children: a pasted wrapper loses its markup without taking the words with it.
   */
  function pruneNode(value: unknown): JSONContent[] {
    if (!isRecord(value) || typeof value.type !== "string") return []

    const type = value.type
    const children = pruneContent(value.content)

    if (type === "text") {
      if (typeof value.text !== "string" || value.text === "") return []
      const marks = pruneMarks(value.marks)
      return [marks ? { type, text: value.text, marks } : { type, text: value.text }]
    }

    const nodeType = schema.nodes[type]
    if (!nodeType) return children

    const node: JSONContent = { type }
    const attrs = pruneAttrs(type, nodeType.spec.attrs, value.attrs)
    if (attrs) node.attrs = attrs
    if (children.length > 0) node.content = children

    return [node]
  }

  function pruneContent(content: unknown): JSONContent[] {
    return Array.isArray(content) ? content.flatMap(pruneNode) : []
  }

  return function normalize(value: unknown): RichTextDocument | null {
    if (!isRecord(value)) return null

    const content = pruneContent(value.content)
    if (content.length === 0) return null

    try {
      const document = ProseMirrorNode.fromJSON(schema, { type: "doc", content })
      // `fromJSON` builds whatever it is handed; `check` is what rejects a shape the
      // schema forbids, such as a list item loose in the body. The editor cannot make
      // one, so a document that fails here came from somewhere else and is refused
      // rather than repaired.
      document.check()

      // A document is words. Nothing but an empty paragraph, or a lone divider, is the
      // empty submission a form is meant to reject.
      return document.textContent.trim() === "" ? null : (document.toJSON() as RichTextDocument)
    } catch {
      return null
    }
  }
}

/**
 * The schema for one kind of document, from the features its consumer allows. Building
 * one walks every extension, so a consumer creates it once at module level.
 */
export function createDocumentSchema(features: readonly Extensions[]): DocumentSchema {
  const extensions = [...baseFeatures, ...features.flat()]
  const headingLevels = configuredHeadingLevels(extensions)
  const normalize = createNormalizer(getSchema(extensions), headingLevels)

  return {
    extensions,
    headingLevels,
    normalize,
    parse: (json) => {
      try {
        return normalize(JSON.parse(json))
      } catch {
        return null
      }
    }
  }
}
