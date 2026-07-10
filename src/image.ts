import { mkdir, writeFile } from "node:fs/promises"
import { dirname, extname, isAbsolute, relative, resolve } from "node:path"
import type { StoredAuth } from "./auth.js"
import {
  CHATGPT_IMAGE_ENDPOINT,
  DEFAULT_IMAGE_MODEL,
  OPENAI_IMAGE_ENDPOINT,
  USER_AGENT,
} from "./constants.js"

export type ImageFormat = "png" | "jpeg" | "webp"

export type GenerateImageInput = {
  prompt: string
  outputPath?: string
  size?: "auto" | "1024x1024" | "1536x1024" | "1024x1536"
  quality?: "auto" | "low" | "medium" | "high"
  background?: "auto" | "transparent" | "opaque"
  format?: ImageFormat
}

type ImageResponse = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>
  error?: { message?: string }
}

export type GeneratedImage = {
  absolutePath: string
  base64: string
  mime: string
  revisedPrompt?: string
}

function extension(format: ImageFormat): string {
  return format === "jpeg" ? ".jpg" : `.${format}`
}

function mime(format: ImageFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`
}

function defaultFilename(format: ImageFormat): string {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
  return `generated-images/image-${stamp}${extension(format)}`
}

function outputFile(directory: string, requested: string | undefined, format: ImageFormat): string {
  const root = resolve(directory)
  const candidate = requested ?? defaultFilename(format)
  const absolute = resolve(root, candidate)
  const distance = relative(root, absolute)
  if (distance === ".." || distance.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(distance)) {
    throw new Error("output_path must stay inside the current directory")
  }
  if (requested && extname(absolute).toLowerCase() !== extension(format)) {
    throw new Error(`output_path must end in ${extension(format)}`)
  }
  return absolute
}

export async function generateImage(
  auth: StoredAuth,
  input: GenerateImageInput,
  directory: string,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedImage> {
  const format = input.format ?? "png"
  const endpoint = auth.type === "oauth" ? CHATGPT_IMAGE_ENDPOINT : OPENAI_IMAGE_ENDPOINT
  const headers = new Headers({
    Authorization: `Bearer ${auth.type === "oauth" ? auth.access : auth.key}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    originator: "opencode-image-generation",
  })
  if (auth.type === "oauth" && auth.accountId) headers.set("ChatGPT-Account-Id", auth.accountId)

  const response = await fetcher(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: DEFAULT_IMAGE_MODEL,
      prompt: input.prompt,
      n: 1,
      size: input.size ?? "auto",
      quality: input.quality ?? "auto",
      background: input.background ?? "auto",
      output_format: format,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as ImageResponse
  if (!response.ok) throw new Error(body.error?.message ?? `Image generation failed (${response.status})`)
  const result = body.data?.[0]
  if (!result?.b64_json) throw new Error("Image generation returned no image data")

  const absolutePath = outputFile(directory, input.outputPath, format)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, Buffer.from(result.b64_json, "base64"), { flag: "wx" })
  return {
    absolutePath,
    base64: result.b64_json,
    mime: mime(format),
    revisedPrompt: result.revised_prompt,
  }
}
