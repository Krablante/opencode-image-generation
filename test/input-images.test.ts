import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { loadImageInputs, MAX_INPUT_IMAGES } from "../src/input-images.js"

const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("png")])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
const WEBP = Buffer.from("RIFF0000WEBPdata")
const GIF = Buffer.from("GIF89a-data")

async function withTemp(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "opencode-image-inputs-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("loads supported formats by signature and authorizes real paths", async () => {
  await withTemp(async (directory) => {
    await Promise.all([
      writeFile(join(directory, "one.bin"), PNG),
      writeFile(join(directory, "two.bin"), JPEG),
      writeFile(join(directory, "three.bin"), WEBP),
      writeFile(join(directory, "four.bin"), GIF),
    ])
    let authorized: string[] = []
    const result = await loadImageInputs({
      imagePaths: ["one.bin", "two.bin", "three.bin", "four.bin"],
      directory,
      authorize: async (paths) => {
        authorized = paths
      },
    })
    assert.deepEqual(
      result.images.map((image) => image.mime),
      ["image/png", "image/jpeg", "image/webp", "image/gif"],
    )
    assert.deepEqual(authorized, ["one.bin", "two.bin", "three.bin", "four.bin"].map((path) => resolve(directory, path)))
    assert.match(result.images[0].dataUrl, /^data:image\/png;base64,/)
  })
})

test("rejects more than the supported number of inputs before authorization", async () => {
  let authorized = false
  await assert.rejects(
    loadImageInputs({
      imagePaths: Array.from({ length: MAX_INPUT_IMAGES + 1 }, (_, index) => `image-${index}.png`),
      directory: "/tmp",
      authorize: async () => {
        authorized = true
      },
    }),
    /At most 5/,
  )
  assert.equal(authorized, false)
})

test("rejects duplicate real paths", async () => {
  await withTemp(async (directory) => {
    await writeFile(join(directory, "same.png"), PNG)
    await assert.rejects(
      loadImageInputs({
        imagePaths: ["same.png", join(directory, "same.png")],
        directory,
        authorize: async () => {},
      }),
      /must be unique/,
    )
  })
})

test("requires a PNG mask and exactly one input image", async () => {
  await withTemp(async (directory) => {
    await writeFile(join(directory, "input.png"), PNG)
    await writeFile(join(directory, "mask.jpg"), JPEG)
    await assert.rejects(
      loadImageInputs({
        imagePaths: ["input.png"],
        maskPath: "mask.jpg",
        directory,
        authorize: async () => {},
      }),
      /must reference a PNG/,
    )
    await assert.rejects(
      loadImageInputs({ maskPath: "mask.jpg", directory, authorize: async () => {} }),
      /requires exactly one input image/,
    )
  })
})

test("rejects unsupported content even when the extension looks valid", async () => {
  await withTemp(async (directory) => {
    await writeFile(join(directory, "fake.png"), "not an image")
    await assert.rejects(
      loadImageInputs({ imagePaths: ["fake.png"], directory, authorize: async () => {} }),
      /Unsupported input image format/,
    )
  })
})
