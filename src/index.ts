import { Plugin } from "@opencode/plugin"
import { basename, isAbsolute, relative, resolve } from "node:path"
import { toStoredAuth } from "./auth.js"
import { loadConfig } from "./config.js"
import { generateImage } from "./image.js"
import { loadImageInputs, MAX_INPUT_IMAGES } from "./input-images.js"

type ImageGenerateInput = {
  prompt: string
  output_path?: string
  size?: "auto" | "1024x1024" | "1536x1024" | "1024x1536"
  quality?: "auto" | "low" | "medium" | "high"
  background?: "auto" | "opaque"
  format?: "png" | "jpeg" | "webp"
  input_images?: string[]
  mask_path?: string
}

function containsPath(root: string, target: string): boolean {
  const distance = relative(resolve(root), resolve(target))
  return distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))
}

export default Plugin.define({
  id: "opencode.image-generation",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "image_generate",
        description: "Generate or edit an image with the active OpenAI credential.",
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", minLength: 1 },
            output_path: { type: "string" },
            size: { type: "string", enum: ["auto", "1024x1024", "1536x1024", "1024x1536"] },
            quality: { type: "string", enum: ["auto", "low", "medium", "high"] },
            background: { type: "string", enum: ["auto", "opaque"] },
            format: { type: "string", enum: ["png", "jpeg", "webp"] },
            input_images: { type: "array", items: { type: "string" }, maxItems: MAX_INPUT_IMAGES },
            mask_path: { type: "string" },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        async execute(input, context) {
          const args = input as ImageGenerateInput
          const connection = await ctx.integration.connection.active("openai")
          const credential = connection && await ctx.integration.connection.resolve(connection)
          if (!credential) throw new Error("Configure an OpenAI credential before generating an image.")

          const config = await loadConfig(ctx.location.directory)
          const inputs = await loadImageInputs({
            imagePaths: args.input_images,
            maskPath: args.mask_path,
            directory: ctx.location.directory,
            authorize: async (paths) => {
              if (paths.some((path) => !containsPath(ctx.location.directory, path))) {
                throw new Error("Input images must be inside the project directory.")
              }
            },
          })
          const image = await generateImage(
            toStoredAuth(credential),
            {
              prompt: args.prompt,
              outputPath: args.output_path,
              size: args.size,
              quality: args.quality,
              background: args.background,
              format: args.format,
              inputImages: inputs.images,
              mask: inputs.mask,
            },
            config.outputRoot,
            fetch,
            context.signal,
          )

          return {
            content: [
              { type: "text", text: `${image.mode === "edit" ? "Edited" : "Generated"} image: ${image.absolutePath}` },
              { type: "file", uri: new URL(`file:///${image.absolutePath.replaceAll("\\", "/")}`).href, mime: image.mime, name: basename(image.absolutePath) },
            ],
          }
        },
      })
    })
  },
})
