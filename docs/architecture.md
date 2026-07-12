# Architecture

OpenCode Image Generation is a standalone OpenCode function-tool plugin. It does
not patch the OpenCode provider, session, or LLM runtime.

## Components

- `src/index.ts` exposes the plugin hooks and `image_generate` tool.
- `src/auth.ts` observes OpenCode's `openai` credential and preserves login and
  refresh behavior.
- `src/config.ts` resolves the output-root policy.
- `src/input-images.ts` resolves, authorizes, validates, and loads local images.
- `src/image.ts` selects the OpenAI transport and persists the result.

## Request flows

### Text-to-image

```text
model tool call
  -> validate output path
  -> OpenAI or ChatGPT images/generations
  -> decode base64
  -> exclusive file write
  -> OpenCode attachment
```

### ChatGPT OAuth edit

```text
input paths
  -> OpenCode permissions
  -> signature and size validation
  -> data:image/... base64 URLs
  -> chatgpt.com/backend-api/codex/images/edits JSON request
  -> PNG output
```

This mirrors the current Codex CLI image-generation extension.

### OpenAI API-key edit

```text
input paths and optional mask
  -> OpenCode permissions
  -> signature and size validation
  -> api.openai.com/v1/images/edits multipart request
     image[] + optional mask
  -> requested PNG, JPEG, or WebP output
```

## Security boundaries

- The plugin never exposes credentials in tool arguments or results.
- Existing OpenCode auth storage and refresh APIs remain the credential owner.
- Local inputs require a `read` permission decision.
- Inputs outside the active directory also require `external_directory`.
- Symlinks are resolved before permission requests and duplicate detection.
- Output paths are confined to the configured output root.
- Existing output files are never overwritten.
- Input and output validation happens before a paid image request whenever
  possible.

OpenCode plugins execute with the user's OS permissions. Permission prompts are
therefore an important user-consent boundary, not an operating-system sandbox.
