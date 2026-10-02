import type {
  TuiDialogSelectOption,
  TuiPlugin,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import { copyPlainText } from "./clipboard.ts"

const COMMAND = "message-copy.open"
const DEFAULT_BINDING = "<leader>Y"

type Options = {
  binding?: string | false
  includeUser?: boolean
  includeAssistant?: boolean
}

type Choice = {
  id: string
  role: "user" | "assistant"
  text: string
  created?: number
}

function readOptions(value: unknown): Required<Pick<Options, "includeUser" | "includeAssistant">> & {
  binding: string | false
} {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const binding = input.binding === false ? false : typeof input.binding === "string" ? input.binding : DEFAULT_BINDING

  return {
    binding,
    includeUser: input.includeUser !== false,
    includeAssistant: input.includeAssistant !== false,
  }
}

function messageText(parts: readonly unknown[]): string {
  return parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") return []
      const item = part as Record<string, unknown>
      if (item.type !== "text") return []
      if (item.synthetic === true || item.ignored === true) return []
      if (typeof item.text !== "string") return []
      return [item.text]
    })
    .join("\n")
    .trim()
}

function searchable(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function timeLabel(timestamp: number | undefined): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) return
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const tui: TuiPlugin = async (api, rawOptions) => {
  const options = readOptions(rawOptions)

  const open = () => {
    const route = api.route.current
    if (route.name !== "session") {
      api.ui.toast({
        variant: "warning",
        message: "Open a session before choosing a message to copy.",
      })
      return
    }

    const sessionID = route.params?.sessionID
    if (typeof sessionID !== "string") {
      api.ui.toast({
        variant: "error",
        message: "The current session has no session ID.",
      })
      return
    }

    const choices: Choice[] = api.state.session
      .messages(sessionID)
      .flatMap((message) => {
        if (message.role !== "user" && message.role !== "assistant") return []
        if (message.role === "user" && !options.includeUser) return []
        if (message.role === "assistant" && !options.includeAssistant) return []

        const text = messageText(api.state.part(message.id))
        if (!text) return []

        return [
          {
            id: message.id,
            role: message.role,
            text,
            created: message.time?.created,
          } satisfies Choice,
        ]
      })
      .reverse()

    if (choices.length === 0) {
      api.ui.toast({
        variant: "warning",
        message: "No copyable text messages were found in this session.",
      })
      return
    }

    const selectOptions: TuiDialogSelectOption<Choice>[] = choices.map((choice) => ({
      // DialogSelect fuzzy-searches `title`. Keep the *full* message here and
      // let the native dialog truncate only its rendered preview.
      title: `${choice.role === "assistant" ? "Assistant" : "User"} · ${searchable(choice.text)}`,
      footer: timeLabel(choice.created),
      value: choice,
    }))

    api.ui.dialog.setSize("xlarge")
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<Choice>({
        title: "Copy message",
        placeholder: "Fuzzy search full message text",
        options: selectOptions,
        flat: true,
        onSelect(option) {
          const choice = option.value
          api.ui.dialog.clear()

          void copyPlainText(choice.text).then((result) => {
            if (!result.ok) {
              api.ui.toast({
                variant: "error",
                message: "Could not access a clipboard. Install wl-clipboard, xclip, or xsel on Linux, or use an OSC52-capable terminal.",
              })
              return
            }

            api.ui.toast({
              variant: "success",
              message: `Copied ${choice.role} message${result.method ? ` via ${result.method}` : ""}.`,
            })
          })
        },
      }),
    )
  }

  api.keymap.registerLayer({
    mode: "base",
    commands: [
      {
        name: COMMAND,
        title: "Copy message",
        desc: "Fuzzy-search the current session and copy one message as plain text",
        category: "Session",
        namespace: "palette",
        slashName: "copy-message",
        run: open,
      },
    ],
    bindings: options.binding
      ? [
          {
            key: options.binding,
            cmd: COMMAND,
            desc: "Copy a message",
          },
        ]
      : [],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-message-copy",
  tui,
}

export default plugin
