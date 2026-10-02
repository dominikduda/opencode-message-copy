# opencode-message-copy

A small OpenCode TUI plugin for fuzzy-searching the current session and copying **one specific user or assistant message** as plain text.

It does not patch OpenCode, walk private renderer internals, or replace the session UI. It uses the public TUI plugin APIs:

- `api.state.session.messages(...)`
- `api.state.part(...)`
- `api.ui.DialogSelect`
- `api.keymap.registerLayer(...)`

OpenCode's native `DialogSelect` already uses fuzzy matching, so the search behaves like other OpenCode pickers.

## Features

- Fuzzy-searches the **full text** of every message, not just the visible preview.
- Includes both user and assistant messages by default.
- Copies the original text parts without terminal formatting/ANSI sequences.
- Newest messages appear first when the search box is empty.
- macOS clipboard support via `pbcopy`.
- Linux Wayland support via `wl-copy`.
- Linux X11 support via `xclip` or `xsel`.
- WSL fallback via `clip.exe`.
- OSC52 is emitted as an additional/fallback clipboard path, useful in many terminals and remote/tmux workflows.
- No runtime npm dependencies.

## Usage

By default:

- `<leader>Y` opens the picker. OpenCode's default leader is `Ctrl+X`, so this is normally **Ctrl+X, then Shift+Y**.
- `/copy-message` opens the same picker.
- The command is also available from OpenCode's command palette as **Copy message**.

Type to fuzzy-filter, use the normal OpenCode select-dialog navigation, and press Enter to copy the selected message.

## Install from GitHub

### Important: TUI plugins belong in `tui.json`

Current OpenCode keeps TUI plugin configuration in `tui.json`, not `opencode.json`.

The OpenCode installer uses npm's package resolver internally (`npm-package-arg` + Arborist), which can resolve Git/GitHub package specs. Git installation is not as prominently documented as npm-package installation, so a local-file fallback is included below.

After uploading this repository to GitHub, add it to your OpenCode `tui.json` (commonly `~/.config/opencode/tui.json`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "git+https://github.com/YOUR_GITHUB_USERNAME/opencode-message-copy.git"
  ]
}
```

Or install it using OpenCode's plugin command, which should patch the appropriate TUI config automatically:

```bash
opencode plugin git+https://github.com/YOUR_GITHUB_USERNAME/opencode-message-copy.git --global
```

You can pin a Git commit/tag in the Git spec if you do not want updates from the repository's default branch.

## Configure

A plugin entry may be a tuple containing options:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "git+https://github.com/YOUR_GITHUB_USERNAME/opencode-message-copy.git",
      {
        "binding": "<leader>Y",
        "includeUser": true,
        "includeAssistant": true
      }
    ]
  ]
}
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `binding` | `"<leader>Y"` | Shortcut that opens the picker. Set to `false` to disable the shortcut and use the palette or `/copy-message`. |
| `includeUser` | `true` | Include user messages in the picker. |
| `includeAssistant` | `true` | Include assistant messages in the picker. |

## Local-file fallback

If your OpenCode build does not accept the Git package spec directly, clone the repository somewhere permanent:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/opencode-message-copy.git ~/.local/share/opencode-message-copy
```

Then reference the package directory from `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file:///Users/YOU/.local/share/opencode-message-copy"
  ]
}
```

On Linux, use your actual absolute path, for example:

```json
{
  "plugin": [
    "file:///home/you/.local/share/opencode-message-copy"
  ]
}
```

OpenCode also supports relative path plugin specs; they are resolved relative to the config file that declares them.

## Linux clipboard notes

For a native desktop clipboard, install one of these:

- Wayland: `wl-copy` from `wl-clipboard`
- X11: `xclip`
- X11 alternative: `xsel`

The plugin also emits OSC52. If your terminal accepts OSC52 clipboard sequences, copying may still work without those utilities.

## Development

```bash
npm install
npm run typecheck
```

The package deliberately exports its TypeScript TUI entry directly. OpenCode runs on Bun and its TUI plugin loader supports TypeScript file plugins/package entrypoints.

## How fuzzy search works

The plugin passes the full whitespace-normalized message body as each native `DialogSelect` option's `title`. OpenCode renders only a truncated preview, but its internal fuzzy matcher searches the entire title. The unmodified original message text is retained separately and is what gets copied.

## License

MIT
