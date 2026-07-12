import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, extname, isAbsolute, relative, resolve } from "node:path"
import type { StoredAuth } from "./auth.js"
import {
  CHATGPT_IMAGE_EDIT_ENDPOINT,
  CHATGPT_IMAGE_ENDPOINT,
  DEFAULT_IMAGE_MODEL,
  OPENAI_IMAGE_EDIT_ENDPOINT,
  OPENAI_IMAGE_ENDPOINT,
  USER_AGENT,
} from "./constants.js"
import type { LoadedImage } from "./input-images.js"

export type ImageFormat = "png" | "jpeg" | "webp"

export type GenerateImageInput = {
  prompt: string
  outputPath?: string
  size?: "auto" | "1024x1024" | "1536x1024" | "1024x1536"
  quality?: "auto" | "low" | "medium" | "high"
  background?: "auto" | "opaque"
  format?: ImageFormat
  inputImages?: LoadedImage[]
  mask?: LoadedImage
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
  mode: "generation" | "edit"
}

function extension(format: ImageFormat): string {
  return format === "jpeg" ? ".jpg" : `.${format}`
}

function mime(format: ImageFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`
}

function defaultFilename(format: ImageFormat): string {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
  return `image-${stamp}${extension(format)}`
}

function outputFile(outputRoot: string, requested: string | undefined, format: ImageFormat): string {
  const root = resolve(outputRoot)
  const candidate = requested ?? defaultFilename(format)
  const absolute = resolve(root, candidate)
  const distance = relative(root, absolute)
  if (distance === ".." || distance.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(distance)) {
    throw new Error("output_path must stay inside the configured output directory")
  }
  if (requested && extname(absolute).toLowerCase() !== extension(format)) {
    throw new Error(`output_path must end in ${extension(format)}`)
  }
  return absolute
}

export async function generateImage(
  auth: StoredAuth,
  input: GenerateImageInput,
  outputRoot: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const format = input.format ?? "png"
  const absolutePath = outputFile(outputRoot, input.outputPath, format)
  await mkdir(dirname(absolutePath), { recursive: true })
  try {
    await access(absolutePath)
    throw new Error(`Output file already exists: ${absolutePath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const inputImages = input.inputImages ?? []
  const mode = inputImages.length > 0 ? "edit" : "generation"
  if (input.mask && mode !== "edit") throw new Error("A mask requires at least one input image")
  if (input.mask && auth.type === "oauth") {
    throw new Error("mask_path is supported with OpenAI API-key authentication only")
  }
  if (mode === "edit" && auth.type === "oauth" && format !== "png") {
    throw new Error("ChatGPT OAuth image edits currently return PNG; set format to png")
  }

  const endpoint =
    mode === "edit"
      ? auth.type === "oauth"
        ? CHATGPT_IMAGE_EDIT_ENDPOINT
        : OPENAI_IMAGE_EDIT_ENDPOINT
      : auth.type === "oauth"
        ? CHATGPT_IMAGE_ENDPOINT
        : OPENAI_IMAGE_ENDPOINT
  const headers = new Headers({
    Authorization: `Bearer ${auth.type === "oauth" ? auth.access : auth.key}`,
    "User-Agent": USER_AGENT,
    originator: "opencode-image-generation",
  })
  if (auth.type === "oauth" && auth.accountId) headers.set("ChatGPT-Account-Id", auth.accountId)

  let body: BodyInit
  if (mode === "edit" && auth.type === "api") {
    const form = new FormData()
    form.set("model", DEFAULT_IMAGE_MODEL)
    form.set("prompt", input.prompt)
    form.set("n", "1")
    form.set("size", input.size ?? "auto")
    form.set("quality", input.quality ?? "auto")
    form.set("background", input.background ?? "auto")
    form.set("output_format", format)
    for (const image of inputImages) {
      form.append("image[]", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), image.filename)
    }
    if (input.mask) {
      form.set("mask", new Blob([new Uint8Array(input.mask.bytes)], { type: input.mask.mime }), input.mask.filename)
    }
    body = form
  } else {
    headers.set("Content-Type", "application/json")
    body = JSON.stringify(
      mode === "edit"
        ? {
            model: DEFAULT_IMAGE_MODEL,
            prompt: input.prompt,
            images: inputImages.map((image) => ({ image_url: image.dataUrl })),
            n: 1,
            size: input.size ?? "auto",
            quality: input.quality ?? "auto",
          }
        : {
            model: DEFAULT_IMAGE_MODEL,
            prompt: input.prompt,
            n: 1,
            size: input.size ?? "auto",
            quality: input.quality ?? "auto",
            background: input.background ?? "auto",
            output_format: format,
          },
    )
  }

  const response = await fetcher(endpoint, {
    method: "POST",
    headers,
    body,
    signal,
  })
  const responseBody = (await response.json().catch(() => ({}))) as ImageResponse
  if (!response.ok) throw new Error(responseBody.error?.message ?? `Image generation failed (${response.status})`)
  const result = responseBody.data?.[0]
  if (!result?.b64_json) throw new Error("Image generation returned no image data")

  await writeFile(absolutePath, Buffer.from(result.b64_json, "base64"), { flag: "wx" })
  return {
    absolutePath,
    base64: result.b64_json,
    mime: mime(format),
    revisedPrompt: result.revised_prompt,
    mode,
  }
}
