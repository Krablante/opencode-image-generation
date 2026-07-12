import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  CHATGPT_IMAGE_EDIT_ENDPOINT,
  CHATGPT_IMAGE_ENDPOINT,
  OPENAI_IMAGE_EDIT_ENDPOINT,
  OPENAI_IMAGE_ENDPOINT,
} from "../src/constants.js"
import { generateImage } from "../src/image.js"
import type { LoadedImage } from "../src/input-images.js"

const loadedPng = (name = "input.png"): LoadedImage => {
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("image")])
  return {
    path: `/tmp/${name}`,
    filename: name,
    mime: "image/png",
    bytes,
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
  }
}

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
      { prompt: "test", outputPath: "nested/test.png" },
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

test("propagates tool cancellation to the image request", async () => {
  await withTemp(async (directory) => {
    const controller = new AbortController()
    let received: AbortSignal | null | undefined
    await generateImage(
      { type: "api", key: "key" },
      { prompt: "test" },
      directory,
      async (_url, init) => {
        received = init?.signal
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      controller.signal,
    )
    assert.equal(received, controller.signal)
  })
})

test("uses the Codex-compatible JSON edit endpoint for OAuth inputs", async () => {
  await withTemp(async (directory) => {
    let request: Request | undefined
    const input = loadedPng()
    const result = await generateImage(
      { type: "oauth", access: "secret", refresh: "refresh", expires: Date.now() + 60_000, accountId: "acct" },
      { prompt: "make it blue", outputPath: "edit.png", inputImages: [input] },
      directory,
      async (url, init) => {
        request = new Request(url, init)
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    )
    assert.equal(request?.url, CHATGPT_IMAGE_EDIT_ENDPOINT)
    assert.match(request?.headers.get("content-type") ?? "", /application\/json/)
    const body = JSON.parse(await request!.text()) as { images: Array<{ image_url: string }> }
    assert.deepEqual(body.images, [{ image_url: input.dataUrl }])
    assert.equal(result.mode, "edit")
    assert.equal(result.mime, "image/png")
  })
})

test("uses multipart image[] and mask fields for API-key edits", async () => {
  await withTemp(async (directory) => {
    let request: Request | undefined
    const result = await generateImage(
      { type: "api", key: "key" },
      {
        prompt: "edit masked area",
        outputPath: "edit.webp",
        format: "webp",
        inputImages: [loadedPng("source.png")],
        mask: loadedPng("mask.png"),
      },
      directory,
      async (url, init) => {
        request = new Request(url, init)
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    )
    assert.equal(request?.url, OPENAI_IMAGE_EDIT_ENDPOINT)
    assert.match(request?.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/)
    const form = await request!.formData()
    assert.equal(form.getAll("image[]").length, 1)
    assert.equal((form.get("mask") as File).name, "mask.png")
    assert.equal(form.get("output_format"), "webp")
    assert.equal(result.mode, "edit")
    assert.equal(result.mime, "image/webp")
  })
})

test("rejects unsupported OAuth edit options before calling the API", async () => {
  await withTemp(async (directory) => {
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      return new Response()
    }
    const auth = { type: "oauth", access: "secret", refresh: "refresh", expires: Date.now() + 60_000 } as const
    await assert.rejects(
      generateImage(
        auth,
        { prompt: "edit", outputPath: "masked.png", inputImages: [loadedPng()], mask: loadedPng("mask.png") },
        directory,
        fetcher,
      ),
      /API-key authentication only/,
    )
    await assert.rejects(
      generateImage(
        auth,
        { prompt: "edit", outputPath: "edit.webp", format: "webp", inputImages: [loadedPng()] },
        directory,
        fetcher,
      ),
      /return PNG/,
    )
    assert.equal(calls, 0)
  })
})

test("rejects output paths outside the configured output directory before calling the API", async () => {
  await withTemp(async (directory) => {
    let called = false
    await assert.rejects(
      generateImage(
        { type: "api", key: "key" },
        { prompt: "test", outputPath: "../escape.png" },
        directory,
        async () => {
          called = true
          return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
      ),
      /inside the configured output directory/,
    )
    assert.equal(called, false)
  })
})

test("refuses to overwrite an existing file before calling the API", async () => {
  await withTemp(async (directory) => {
    await writeFile(join(directory, "existing.png"), "keep")
    let called = false
    await assert.rejects(
      generateImage(
        { type: "api", key: "key" },
        { prompt: "test", outputPath: "existing.png" },
        directory,
        async () => {
          called = true
          return new Response()
        },
      ),
      /already exists/,
    )
    assert.equal(called, false)
    assert.equal(await readFile(join(directory, "existing.png"), "utf8"), "keep")
  })
})
