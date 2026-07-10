import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import OpenCodeImageGenerationPlugin from "../src/index.js"

test("loads as a plugin, observes OpenAI auth, and returns a file attachment", async () => {
  const worktree = await mkdtemp(join(tmpdir(), "opencode-image-plugin-"))
  const originalFetch = globalThis.fetch
  const originalOutputDirectory = process.env.OPENCODE_IMAGE_GENERATION_DIR
  try {
    process.env.OPENCODE_IMAGE_GENERATION_DIR = join(worktree, "generated")
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })

    const hooks = await OpenCodeImageGenerationPlugin({
      client: { auth: { set: async () => ({}) } },
      project: {},
      directory: worktree,
      worktree: "/",
      experimental_workspace: { register() {} },
      serverUrl: new URL("http://localhost"),
      $: {},
    } as never)

    assert.equal(hooks.auth?.provider, "openai")
    assert.deepEqual(
      hooks.auth?.methods.map((method) => method.label),
      ["ChatGPT Plus/Pro (browser)", "ChatGPT Plus/Pro (headless)", "OpenAI API key"],
    )
    await hooks.auth?.loader?.(async () => ({ type: "api", key: "key" }), {} as never)

    const result = await hooks.tool?.image_generate.execute(
      { prompt: "test", output_path: "integration.png" },
      {
        sessionID: "session",
        messageID: "message",
        agent: "build",
        directory: worktree,
        worktree: "/",
        abort: new AbortController().signal,
        metadata() {},
        async ask() {},
      },
    )
    assert.equal(typeof result, "object")
    if (typeof result === "object") {
      assert.equal(result.attachments?.[0]?.type, "file")
      assert.equal(result.attachments?.[0]?.mime, "image/png")
      assert.match(result.output, /generated\/integration\.png/)
    }
  } finally {
    globalThis.fetch = originalFetch
    if (originalOutputDirectory === undefined) delete process.env.OPENCODE_IMAGE_GENERATION_DIR
    else process.env.OPENCODE_IMAGE_GENERATION_DIR = originalOutputDirectory
    await rm(worktree, { recursive: true, force: true })
  }
})
