# OpenCode Image Generation

Generate images from OpenCode with the OpenAI credential you already use there. The plugin supports both ChatGPT Plus/Pro OAuth and regular OpenAI API keys, saves generated files in your worktree, and returns each image to the model as a tool attachment.

## Why this plugin

OpenCode can call local function tools, while OpenAI exposes image generation through a dedicated API. This plugin bridges the two without patching OpenCode or replacing its LLM runtime.

- Reuses the existing `openai` authentication entry.
- Refreshes expiring ChatGPT OAuth tokens and saves the refreshed credential through OpenCode.
- Uses the same ChatGPT image endpoint and OAuth client as Codex CLI.
- Falls back to the public OpenAI Images API for API-key accounts.
- Keeps output paths inside the active worktree.
- Returns a normal OpenCode image attachment so the model can inspect the result.

> [!IMPORTANT]
> ChatGPT OAuth image generation uses an undocumented ChatGPT backend endpoint also used by Codex CLI. It can change without a public API compatibility guarantee.

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

## Use

Ask the model naturally:

```text
Generate a square watercolor illustration of a lighthouse in a winter storm.
Save it to assets/lighthouse.png.
```

The model can call `image_generate` with these options:

| Argument | Values |
| --- | --- |
| `prompt` | Required image description |
| `output_path` | Relative path inside the worktree |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | `auto`, `low`, `medium`, `high` |
| `background` | `auto`, `transparent`, `opaque` |
| `format` | `png`, `jpeg`, `webp` |

If `output_path` is omitted, the file is written under `generated-images/`.

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
