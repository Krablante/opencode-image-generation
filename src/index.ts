import type { Plugin, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { createAuthMethods, ensureFreshAuth, type StoredAuth } from "./auth.js"
import { loadConfig } from "./config.js"
import { OPENAI_PROVIDER_ID } from "./constants.js"
import { generateImage } from "./image.js"
import { loadImageInputs, MAX_INPUT_IMAGES } from "./input-images.js"

function containsPath(root: string, target: string): boolean {
  const distance = relative(resolve(root), resolve(target))
  return distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))
}

async function authorizeInputFiles(
  context: ToolContext,
  paths: string[],
) {
  const externalPatterns = [
    ...new Set(
      paths
        .filter((path) => !containsPath(context.directory, path))
        .map((path) => join(dirname(path), "*").replaceAll("\\", "/")),
    ),
  ]
  if (externalPatterns.length > 0) {
    await context.ask({
      permission: "external_directory",
      patterns: externalPatterns,
      always: externalPatterns,
      metadata: { paths },
    })
  }
  const readPatterns = paths.map((path) => relative(context.worktree, path).replaceAll("\\", "/"))
  await context.ask({ permission: "read", patterns: readPatterns, always: readPatterns, metadata: { paths } })
}

export const OpenCodeImageGenerationPlugin: Plugin = async (input) => {
  let getAuth: (() => Promise<StoredAuth>) | undefined

  return {
    auth: {
      provider: OPENAI_PROVIDER_ID,
      methods: createAuthMethods(),
      async loader(readAuth) {
        getAuth = readAuth as () => Promise<StoredAuth>
        return {}
      },
    },
    tool: {
      image_generate: tool({
        description:
          "Generate or edit an image with OpenAI using the configured ChatGPT OAuth session or OpenAI API key. Optional input_images provide visual references. Saves the result inside the configured output directory and returns it as an attachment.",
        args: {
          prompt: tool.schema.string().min(1).describe("A detailed description of the image to generate"),
          output_path: tool.schema
            .string()
            .optional()
            .describe("Optional relative path inside the configured image output directory"),
          size: tool.schema.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).optional(),
          quality: tool.schema.enum(["auto", "low", "medium", "high"]).optional(),
          background: tool.schema.enum(["auto", "opaque"]).optional(),
          format: tool.schema.enum(["png", "jpeg", "webp"]).optional(),
          input_images: tool.schema
            .array(tool.schema.string().min(1))
            .max(MAX_INPUT_IMAGES)
            .optional()
            .describe("Up to five project-relative, absolute, or home-relative input image paths"),
          mask_path: tool.schema
            .string()
            .min(1)
            .optional()
            .describe("Optional transparent PNG mask path; supported with API-key authentication and one input image"),
        },
        async execute(args, context) {
          if (!getAuth) {
            throw new Error(
              "OpenAI authentication has not been initialized. Configure the openai provider, then retry image_generate.",
            )
          }
          const auth = await ensureFreshAuth(await getAuth(), async (updated) => {
            await input.client.auth.set({ path: { id: OPENAI_PROVIDER_ID }, body: updated })
          })
          if (args.mask_path && auth.type === "oauth") {
            throw new Error("mask_path is supported with OpenAI API-key authentication only")
          }
          const config = await loadConfig(context.directory)
          const inputs = await loadImageInputs({
            imagePaths: args.input_images,
            maskPath: args.mask_path,
            directory: context.directory,
            authorize: (paths) => authorizeInputFiles(context, paths),
          })
          const image = await generateImage(
            auth,
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
            context.abort,
          )
          const revised = image.revisedPrompt ? `\nRevised prompt: ${image.revisedPrompt}` : ""
          return {
            title: image.mode === "edit" ? "Edited image" : "Generated image",
            output: `Image saved to ${image.absolutePath}${revised}`,
            attachments: [
              {
                type: "file",
                mime: image.mime,
                url: `data:${image.mime};base64,${image.base64}`,
                filename: image.absolutePath.split(/[\\/]/).at(-1),
              },
            ],
          }
        },
      }),
    },
  }
}

export default OpenCodeImageGenerationPlugin
