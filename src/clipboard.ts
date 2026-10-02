import { spawn } from "node:child_process"

type CopyResult = {
  ok: boolean
  method?: string
}

function writeOsc52(text: string): boolean {
  if (!process.stdout.isTTY) return false

  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  const passthrough = `\x1bPtmux;\x1b${sequence}\x1b\\`

  // Match OpenCode's own clipboard behavior: emit OSC52 directly, and add a
  // passthrough sequence when running inside tmux/screen.
  process.stdout.write(process.env.TMUX ? sequence + passthrough : process.env.STY ? passthrough : sequence)
  return true
}

function pipe(command: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok)
    }

    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"],
    })

    child.on("error", () => finish(false))
    child.on("close", (code) => finish(code === 0))
    child.stdin?.on("error", () => finish(false))
    child.stdin?.end(text)
  })
}

async function nativeCopy(text: string): Promise<string | undefined> {
  if (process.platform === "darwin") {
    if (await pipe("pbcopy", [], text)) return "pbcopy"
    return
  }

  if (process.platform === "linux") {
    if (process.env.WAYLAND_DISPLAY && (await pipe("wl-copy", [], text))) return "wl-copy"
    if (await pipe("xclip", ["-selection", "clipboard"], text)) return "xclip"
    if (await pipe("xsel", ["--clipboard", "--input"], text)) return "xsel"

    // Useful for WSL when the Linux clipboard tools are not installed.
    if ((process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) && (await pipe("clip.exe", [], text))) {
      return "clip.exe"
    }
  }
}

export async function copyPlainText(text: string): Promise<CopyResult> {
  const osc52 = writeOsc52(text)
  const native = await nativeCopy(text)

  if (native) return { ok: true, method: native }
  if (osc52) return { ok: true, method: "OSC52" }
  return { ok: false }
}
