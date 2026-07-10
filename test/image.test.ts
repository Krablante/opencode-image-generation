import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { CHATGPT_IMAGE_ENDPOINT, OPENAI_IMAGE_ENDPOINT } from "../src/constants.js"
import { generateImage } from "../src/image.js"

async function withTemp(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "opencode-image-generation-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("uses ChatGPT endpoint and account header for OAuth", async () => {
  await withTemp(async (directory) => {
    let request: Request | undefined
    const fetcher: typeof fetch = async (input, init) => {
      request = new Request(input, init)
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const result = await generateImage(
      { type: "oauth", access: "secret", refresh: "refresh", expires: Date.now() + 60_000, accountId: "acct" },
      { prompt: "test", outputPath: "generated-images/test.png" },
      directory,
      fetcher,
    )
    assert.equal(request?.url, CHATGPT_IMAGE_ENDPOINT)
    assert.equal(request?.headers.get("authorization"), "Bearer secret")
    assert.equal(request?.headers.get("chatgpt-account-id"), "acct")
    assert.equal((await readFile(result.absolutePath)).toString(), "png")
  })
})

test("uses public endpoint for API keys", async () => {
  await withTemp(async (directory) => {
    let url = ""
    const fetcher: typeof fetch = async (input) => {
      url = String(input)
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    await generateImage({ type: "api", key: "key" }, { prompt: "test" }, directory, fetcher)
    assert.equal(url, OPENAI_IMAGE_ENDPOINT)
  })
})

test("rejects output paths outside the worktree", async () => {
  await withTemp(async (directory) => {
    await assert.rejects(
      generateImage(
        { type: "api", key: "key" },
        { prompt: "test", outputPath: "../escape.png" },
        directory,
        async () =>
          new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
      /inside the current worktree/,
    )
  })
})
