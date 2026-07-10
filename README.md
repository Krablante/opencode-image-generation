# OpenCode Image Generation

<p align="center">
  <img src="assets/logo.webp" alt="OpenCode Image Generation logo" width="520">
</p>

Generate images from OpenCode with the OpenAI credential you already use there. The plugin supports both ChatGPT Plus/Pro OAuth and regular OpenAI API keys, saves generated files under one predictable output root, and returns each image to the model as a tool attachment.

## Why this plugin

OpenCode can call local function tools, while OpenAI exposes image generation through a dedicated API. This plugin bridges the two without patching OpenCode or replacing its LLM runtime.

- Reuses the existing `openai` authentication entry.
- Refreshes expiring ChatGPT OAuth tokens and saves the refreshed credential through OpenCode.
- Uses the same ChatGPT image endpoint and OAuth client as Codex CLI.
- Falls back to the public OpenAI Images API for API-key accounts.
- Uses a predictable `.opencode/image-generation/` project directory by default.
- Supports a project-relative or absolute user-configured output root.
- Keeps every tool-selected output path inside that root.
- Returns a normal OpenCode image attachment so the model can inspect the result.

> [!IMPORTANT]
> ChatGPT OAuth image generation uses the undocumented
> `https://chatgpt.com/backend-api/codex/images/generations` endpoint also used
> by Codex CLI. It can change without a public API compatibility guarantee.

## Install

Clone the repository to a stable location:

```bash
git clone https://github.com/Krablante/opencode-image-generation.git ~/.local/share/opencode/plugins/opencode-image-generation
```

Add its file URL to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "file:///home/you/.local/share/opencode/plugins/opencode-image-generation"
  ]
}
```

Use an absolute path. Restart OpenCode after changing the configuration.

## Authentication

The plugin attaches to OpenCode's `openai` provider and can reuse an existing credential. If you need to connect again, it preserves equivalent login choices:

- ChatGPT Plus/Pro in a browser;
- ChatGPT Plus/Pro device flow for headless hosts;
- OpenAI API key.

No token is written to this plugin's directory or included in tool output.

## Output directory

By default, every image is stored under:

```text
<current project>/.opencode/image-generation/
```

This portable default follows the Codex pattern of keeping generated artifacts
under a hidden project-local directory. Users who prefer one stable directory
across projects can configure an absolute or home-relative path.

To change it, create `opencode-image-generation.json` in the active OpenCode configuration directory:

```json
{
  "outputDirectory": "~/gen-images"
}
```

Relative paths are resolved from the current project. Absolute paths and home-relative paths are also supported:

```json
{
  "outputDirectory": "~/Pictures/OpenCode"
}
```

The config is reloaded for every tool call, so changing it does not require restarting OpenCode.

Config lookup order:

1. `OPENCODE_IMAGE_GENERATION_CONFIG`, if set;
2. `$OPENCODE_CONFIG_DIR/opencode-image-generation.json`, if `OPENCODE_CONFIG_DIR` is set;
3. `$XDG_CONFIG_HOME/opencode/opencode-image-generation.json`;
4. `~/.config/opencode/opencode-image-generation.json`;
5. `%APPDATA%/opencode/opencode-image-generation.json` on Windows.

`OPENCODE_IMAGE_GENERATION_DIR` overrides `outputDirectory` and is useful for automation or per-host configuration.

## Use

Ask the model naturally:

```text
Generate a square watercolor illustration of a lighthouse in a winter storm.
Name it lighthouse.png.
```

The model can call `image_generate` with these options:

| Argument | Values |
| --- | --- |
| `prompt` | Required image description |
| `output_path` | Optional relative path inside the configured output root |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | `auto`, `low`, `medium`, `high` |
| `background` | `auto`, `transparent`, `opaque` |
| `format` | `png`, `jpeg`, `webp` |

If `output_path` is omitted, the plugin creates a timestamped filename directly under the configured output root. Existing files are never overwritten.

## Development

```bash
npm install
npm run check
```

Tests use mocked OpenAI responses and never require a real credential.

## Security

OpenCode plugins execute with the same user permissions as OpenCode. Install only plugins you trust. This plugin receives the OpenAI credential through OpenCode's public auth loader, uses it only for OpenAI/ChatGPT requests, and does not log it.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT. OAuth interoperability code is based in part on the MIT-licensed OpenCode Codex auth plugin; see [NOTICE](NOTICE).
