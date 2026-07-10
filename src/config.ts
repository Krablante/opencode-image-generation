import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export const DEFAULT_OUTPUT_DIRECTORY = "~/gen-images"
export const CONFIG_FILENAME = "opencode-image-generation.json"

export type ImageGenerationConfig = {
  outputDirectory: string
  outputRoot: string
  configPath: string
}

type ConfigFile = {
  outputDirectory?: unknown
}

function expandHome(value: string, home: string): string {
  if (value === "~") return home
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(home, value.slice(2))
  return value
}

export function defaultConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.OPENCODE_IMAGE_GENERATION_CONFIG) {
    return resolve(expandHome(env.OPENCODE_IMAGE_GENERATION_CONFIG, home))
  }
  if (env.OPENCODE_CONFIG_DIR) return resolve(env.OPENCODE_CONFIG_DIR, CONFIG_FILENAME)
  if (platform === "win32" && env.APPDATA) return resolve(env.APPDATA, "opencode", CONFIG_FILENAME)
  return resolve(env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode", CONFIG_FILENAME)
}

async function readConfigFile(path: string): Promise<ConfigFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ConfigFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in image generation config: ${path}`)
    throw error
  }
}

export async function loadConfig(
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): Promise<ImageGenerationConfig> {
  const configPath = defaultConfigPath(env, home, platform)
  const file = await readConfigFile(configPath)
  const configured = env.OPENCODE_IMAGE_GENERATION_DIR ?? file.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY
  if (typeof configured !== "string" || configured.trim() === "") {
    throw new Error(`outputDirectory in ${configPath} must be a non-empty string`)
  }
  const expanded = expandHome(configured, home)
  const outputRoot = isAbsolute(expanded) ? resolve(expanded) : resolve(directory, expanded)
  return { outputDirectory: configured, outputRoot, configPath }
}
