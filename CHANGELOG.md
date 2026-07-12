# Changelog

All notable changes to this project will be documented here.

## 0.5.0 - 2026-07-10

- Add image-to-image editing from up to five local reference images.
- Add Codex-compatible ChatGPT OAuth edits and official multipart API-key edits.
- Add optional PNG masks for API-key edits with one input image.
- Request OpenCode read and external-directory permissions before loading inputs.
- Detect PNG, JPEG, WebP, and GIF inputs by signature and enforce memory limits.
- Propagate tool cancellation to image API requests.
- Remove the unsupported transparent-background option for `gpt-image-2`.

## 0.4.0 - 2026-07-10

- Restore the portable `.opencode/image-generation/` public default.
- Keep centralized home-directory storage available through plugin configuration.
- Separate public defaults from deployment-specific policies such as Politia's `~/gen-images/` configuration.

## 0.3.1 - 2026-07-10

- Isolate plugin integration tests from the real `~/gen-images/` directory.

## 0.3.0 - 2026-07-10

- Change the default output root to the stable user directory `~/gen-images/`.
- Add a generated project logo to the README.

## 0.2.0 - 2026-07-10

- Save images under the fixed `.opencode/image-generation/` project directory by default.
- Add hot-reloaded `opencode-image-generation.json` configuration with `outputDirectory`.
- Add `OPENCODE_IMAGE_GENERATION_DIR` and `OPENCODE_IMAGE_GENERATION_CONFIG` overrides.
- Restrict `output_path` to the configured output root.
- Validate output paths and existing files before starting a paid image-generation request.

## 0.1.0 - 2026-07-10

- Add `image_generate` with PNG, JPEG, and WebP output.
- Reuse existing OpenCode ChatGPT OAuth or OpenAI API-key credentials.
- Preserve browser, headless, and API-key connection methods for the OpenAI provider.
- Refresh expiring OAuth credentials through OpenCode's auth API.
- Return generated files as OpenCode attachments.
- Resolve output paths from the active directory, including non-git sessions whose worktree is `/`.
