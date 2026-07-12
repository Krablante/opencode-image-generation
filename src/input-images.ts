import { readFile, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, isAbsolute, join, resolve } from "node:path"

export const MAX_INPUT_IMAGES = 5
export const MAX_INPUT_IMAGE_BYTES = 50 * 1024 * 1024
export const MAX_TOTAL_INPUT_BYTES = 100 * 1024 * 1024

export type SupportedImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif"

export type LoadedImage = {
  path: string
  filename: string
  mime: SupportedImageMime
  bytes: Buffer
  dataUrl: string
}

export type LoadedImageInputs = {
  images: LoadedImage[]
  mask?: LoadedImage
}

type LoadImageInputOptions = {
  imagePaths?: string[]
  maskPath?: string
  directory: string
  authorize: (paths: string[]) => Promise<void>
}

function expandHome(path: string): string {
  if (path === "~") return homedir()
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2))
  return path
}

function resolvePath(path: string, directory: string): string {
  const expanded = expandHome(path)
  return resolve(isAbsolute(expanded) ? expanded : resolve(directory, expanded))
}

function detectMime(bytes: Buffer): SupportedImageMime | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp"
  }
  if (bytes.length >= 6) {
    const signature = bytes.toString("ascii", 0, 6)
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif"
  }
  return undefined
}

async function resolveExistingFile(path: string, directory: string): Promise<string> {
  const requested = resolvePath(path, directory)
  try {
    return await realpath(requested)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Input image does not exist: ${requested}`)
    throw error
  }
}

async function inspectFile(path: string): Promise<{ path: string; size: number }> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Input image is not a regular file: ${path}`)
  if (info.size === 0) throw new Error(`Input image is empty: ${path}`)
  if (info.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error(`Input image exceeds ${MAX_INPUT_IMAGE_BYTES / 1024 / 1024} MiB: ${path}`)
  }
  return { path, size: info.size }
}

async function loadFile(path: string): Promise<LoadedImage> {
  const bytes = await readFile(path)
  const mime = detectMime(bytes)
  if (!mime) throw new Error(`Unsupported input image format: ${path}`)
  return {
    path,
    filename: basename(path),
    mime,
    bytes,
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
  }
}

export async function loadImageInputs(options: LoadImageInputOptions): Promise<LoadedImageInputs> {
  const imagePaths = options.imagePaths ?? []
  if (imagePaths.length > MAX_INPUT_IMAGES) throw new Error(`At most ${MAX_INPUT_IMAGES} input images are supported`)
  if (options.maskPath && imagePaths.length !== 1) throw new Error("mask_path requires exactly one input image")
  if (imagePaths.length === 0 && !options.maskPath) return { images: [] }

  const resolvedImages = await Promise.all(imagePaths.map((path) => resolveExistingFile(path, options.directory)))
  const resolvedMask = options.maskPath ? await resolveExistingFile(options.maskPath, options.directory) : undefined
  const allPaths = [...resolvedImages, ...(resolvedMask ? [resolvedMask] : [])]
  if (new Set(allPaths).size !== allPaths.length) throw new Error("Input image and mask paths must be unique")

  await options.authorize(allPaths)
  const inspected = await Promise.all(allPaths.map(inspectFile))
  const totalBytes = inspected.reduce((total, image) => total + image.size, 0)
  if (totalBytes > MAX_TOTAL_INPUT_BYTES) {
    throw new Error(`Combined input images exceed ${MAX_TOTAL_INPUT_BYTES / 1024 / 1024} MiB`)
  }
  const images = await Promise.all(resolvedImages.map(loadFile))
  const mask = resolvedMask ? await loadFile(resolvedMask) : undefined
  if (mask && mask.mime !== "image/png") throw new Error("mask_path must reference a PNG image")
  return { images, mask }
}
