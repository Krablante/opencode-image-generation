import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createAuthMethods, ensureFreshAuth, type StoredAuth } from "./auth.js"
import { loadConfig } from "./config.js"
import { OPENAI_PROVIDER_ID } from "./constants.js"
import { generateImage } from "./image.js"

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
          "Generate an image with OpenAI using the configured ChatGPT OAuth session or OpenAI API key. Saves the image inside the plugin's fixed output directory and returns it as an attachment.",
        args: {
          prompt: tool.schema.string().min(1).describe("A detailed description of the image to generate"),
          output_path: tool.schema
            .string()
            .optional()
            .describe("Optional relative path inside the configured image output directory"),
          size: tool.schema.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).optional(),
          quality: tool.schema.enum(["auto", "low", "medium", "high"]).optional(),
          background: tool.schema.enum(["auto", "transparent", "opaque"]).optional(),
          format: tool.schema.enum(["png", "jpeg", "webp"]).optional(),
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
          const config = await loadConfig(context.directory)
          const image = await generateImage(
            auth,
            {
              prompt: args.prompt,
              outputPath: args.output_path,
              size: args.size,
              quality: args.quality,
              background: args.background,
              format: args.format,
            },
            config.outputRoot,
          )
          const revised = image.revisedPrompt ? `\nRevised prompt: ${image.revisedPrompt}` : ""
          return {
            title: "Generated image",
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
