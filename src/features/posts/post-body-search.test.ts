import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { Client } from "pg"
import { postDocument } from "./post-document"

/**
 * The search side of a Post, exercised against a real Postgres: the extraction function,
 * the generated `tsvector` and the query that finds a published Post by its words. None
 * of it is JavaScript, so nothing but a database can prove it works.
 *
 * The SQL is read out of the migration rather than restated here, and runs in a schema
 * of its own, so the test cannot drift from what ships and cannot touch the app's rows.
 */
const MIGRATION = new URL("../../../drizzle/0008_post-body-as-document.sql", import.meta.url)
const SCHEMA = "post_body_search_test"

const migration = readFileSync(MIGRATION, "utf8")
const createFunction = migration
  .split("--> statement-breakpoint")
  .find((statement) => statement.includes("CREATE FUNCTION post_body_text"))
const generatedExpression = /GENERATED ALWAYS AS \((.+)\) STORED/.exec(migration)?.[1]

async function connect(): Promise<Client | null> {
  if (!process.env.POSTGRES_URL) return null

  const client = new Client({ connectionString: process.env.POSTGRES_URL })
  try {
    await client.connect()
    return client
  } catch {
    // No database to talk to — the suite skips rather than fails, so `bun tst` still
    // runs offline. CI proves this one by providing Postgres.
    return null
  }
}

const client = await connect()
if (!client) {
  console.warn("post-body-search: no reachable POSTGRES_URL, skipping the search tests.")
}

/** A Post as the write path would have stored it, not as a test happened to type it. */
const body = postDocument.normalize({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Repetition" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ta med noterna, " },
        {
          type: "text",
          text: "schemat",
          marks: [{ type: "link", attrs: { href: "https://example.org/hemlig-adress" } }]
        },
        { type: "text", text: " gäller." }
      ]
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Sopran" }] }] }
          ]
        }
      ]
    }
  ]
})

describe.skipIf(!client)("finding a published Post by its words", () => {
  const db = client as Client

  afterAll(async () => {
    if (!client) return
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await client.end()
  })

  /** The table the migration builds, stood up on its own so the app's rows are left alone. */
  beforeAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await db.query(`CREATE SCHEMA ${SCHEMA}`)
    await db.query(`SET search_path TO ${SCHEMA}`)
    await db.query(createFunction as string)
    await db.query(
      `CREATE TABLE post (
         body jsonb NOT NULL,
         body_search tsvector GENERATED ALWAYS AS (${generatedExpression}) STORED
       )`
    )
    await db.query("CREATE INDEX post_body_search_idx ON post USING gin (body_search)")
    await db.query("INSERT INTO post (body) VALUES ($1)", [JSON.stringify(body)])
  })

  /** Whether the stored Post is found by a query someone might actually type. */
  async function findableBy(query: string): Promise<boolean> {
    const { rows } = await db.query("SELECT 1 FROM post WHERE body_search @@ plainto_tsquery('swedish', $1)", [query])
    return rows.length === 1
  }

  test("the migration ships the SQL this test runs", () => {
    expect(createFunction).toBeString()
    expect(generatedExpression).toBe("to_tsvector('swedish', coalesce(post_body_text(\"body\"), ''))")
    expect(body).not.toBeNull()
  })

  test("a word in the body is findable", async () => {
    expect(await findableBy("noterna")).toBe(true)
  })

  test("a word inside a heading, a table and a link's words is findable too", async () => {
    expect(await findableBy("repetition")).toBe(true)
    expect(await findableBy("sopran")).toBe(true)
    expect(await findableBy("schemat")).toBe(true)
  })

  test("a link's destination and the node type names are not words of the Post", async () => {
    // The document is the single source of the prose; its plumbing is not part of it.
    expect(await findableBy("hemlig")).toBe(false)
    expect(await findableBy("paragraph")).toBe(false)
    expect(await findableBy("tableHeader")).toBe(false)
  })

  test("the extracted text is in reading order, so a phrase search holds", async () => {
    const { rows } = await db.query<{ text: string }>("SELECT post_body_text(body) AS text FROM post")

    expect(rows[0]?.text).toBe("Repetition Ta med noterna,  schemat  gäller. Sopran")

    const { rows: phrase } = await db.query("SELECT 1 FROM post WHERE body_search @@ phraseto_tsquery('swedish', $1)", [
      "ta med noterna"
    ])
    expect(phrase.length).toBe(1)
  })
})
