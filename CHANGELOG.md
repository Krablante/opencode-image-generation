# Changelog

All notable changes to this project will be documented here.

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
