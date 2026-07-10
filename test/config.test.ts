import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { CONFIG_FILENAME, DEFAULT_OUTPUT_DIRECTORY, defaultConfigPath, loadConfig } from "../src/config.js"

async function withTemp(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "opencode-image-config-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("uses a stable directory under the user home by default", async () => {
  await withTemp(async (directory) => {
    const config = await loadConfig(directory, { XDG_CONFIG_HOME: join(directory, "missing-config") }, directory, "linux")
    assert.equal(config.outputDirectory, DEFAULT_OUTPUT_DIRECTORY)
    assert.equal(config.outputRoot, resolve(directory, "gen-images"))
  })
})

test("loads a relative output directory from the plugin config", async () => {
  await withTemp(async (directory) => {
    const configDirectory = join(directory, "config")
    await writeFile(join(directory, CONFIG_FILENAME), JSON.stringify({ outputDirectory: "artifacts/images" }))
    const config = await loadConfig(
      directory,
      { OPENCODE_IMAGE_GENERATION_CONFIG: join(directory, CONFIG_FILENAME) },
      directory,
      "linux",
    )
    assert.equal(config.outputRoot, resolve(directory, "artifacts/images"))
    assert.notEqual(config.outputRoot, configDirectory)
  })
})

test("environment output directory overrides the config file and expands home", async () => {
  await withTemp(async (directory) => {
    const configPath = join(directory, CONFIG_FILENAME)
    await writeFile(configPath, JSON.stringify({ outputDirectory: "from-file" }))
    const config = await loadConfig(
      directory,
      {
        OPENCODE_IMAGE_GENERATION_CONFIG: configPath,
        OPENCODE_IMAGE_GENERATION_DIR: "~/Pictures/OpenCode",
      },
      directory,
      "linux",
    )
    assert.equal(config.outputRoot, resolve(directory, "Pictures/OpenCode"))
  })
})

test("uses OPENCODE_CONFIG_DIR for the plugin config path", () => {
  assert.equal(
    defaultConfigPath({ OPENCODE_CONFIG_DIR: "/custom/config" }, "/home/test", "linux"),
    resolve("/custom/config", CONFIG_FILENAME),
  )
})
