import type {
  TuiDialogSelectOption,
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import { SyntaxStyle } from "@opentui/core"
import { jsx, jsxs, type JSX } from "@opentui/solid/jsx-runtime"
import { createSignal } from "solid-js"
import { copyPlainText } from "./clipboard.ts"

const COMMAND = "message-copy.open"
const DEFAULT_BINDING = "<leader>Y"
const PREVIEW_HEIGHT = 16

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

function roleLabel(choice: Choice): string {
  return choice.role === "assistant" ? "Assistant" : "User"
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

function createSyntaxStyle(api: TuiPluginApi) {
  const theme = api.theme.current

  return SyntaxStyle.fromTheme([
    { scope: ["default"], style: { foreground: theme.text } },
    { scope: ["comment", "comment.documentation"], style: { foreground: theme.syntaxComment, italic: true } },
    { scope: ["string", "symbol", "character"], style: { foreground: theme.syntaxString } },
    { scope: ["number", "boolean", "float", "constant"], style: { foreground: theme.syntaxNumber } },
    {
      scope: ["keyword", "keyword.return", "keyword.conditional", "keyword.repeat"],
      style: { foreground: theme.syntaxKeyword },
    },
    {
      scope: ["function", "function.call", "function.method", "constructor"],
      style: { foreground: theme.syntaxFunction },
    },
    { scope: ["type", "class", "module"], style: { foreground: theme.syntaxType } },
    {
      scope: ["operator", "keyword.operator", "punctuation", "punctuation.delimiter"],
      style: { foreground: theme.syntaxOperator },
    },
    {
      scope: ["markup.heading", "markup.heading.1", "markup.heading.2", "markup.heading.3"],
      style: { foreground: theme.markdownHeading, bold: true },
    },
    { scope: ["markup.bold", "markup.strong"], style: { foreground: theme.markdownStrong, bold: true } },
    { scope: ["markup.italic"], style: { foreground: theme.markdownEmph, italic: true } },
    { scope: ["markup.list"], style: { foreground: theme.markdownListItem } },
    { scope: ["markup.quote"], style: { foreground: theme.markdownBlockQuote, italic: true } },
    {
      scope: ["markup.raw", "markup.raw.block", "markup.raw.inline"],
      style: { foreground: theme.markdownCode },
    },
    { scope: ["markup.link", "markup.link.url"], style: { foreground: theme.markdownLink, underline: true } },
    { scope: ["markup.link.label"], style: { foreground: theme.markdownLinkText, underline: true } },
  ])
}

function copyChoice(api: TuiPluginApi, choice: Choice) {
  api.ui.dialog.clear()

  void copyPlainText(choice.text).then((result) => {
    if (!result.ok) {
      api.ui.toast({
        variant: "error",
        message:
          "Could not access a clipboard. Install wl-clipboard, xclip, or xsel on Linux, or use an OSC52-capable terminal.",
      })
      return
    }

    api.ui.toast({
      variant: "success",
      message: `Copied ${choice.role} message${result.method ? ` via ${result.method}` : ""}.`,
    })
  })
}

function MessagePicker(props: {
  api: TuiPluginApi
  choices: Choice[]
  options: TuiDialogSelectOption<Choice>[]
}): JSX.Element {
  const [selected, setSelected] = createSignal(props.choices[0]!)
  const theme = props.api.theme.current
  const syntax = createSyntaxStyle(props.api)

  const picker = props.api.ui.DialogSelect<Choice>({
    title: "Copy message",
    placeholder: "Fuzzy search full message text",
    options: props.options,
    flat: true,
    onMove(option) {
      setSelected(option.value)
    },
    onSelect(option) {
      copyChoice(props.api, option.value)
    },
  })

  const previewHeader = jsx("text", {
    fg: theme.textMuted,
    get children() {
      const choice = selected()
      const time = timeLabel(choice.created)
      return `${roleLabel(choice)}${time ? ` · ${time}` : ""} · Enter to copy`
    },
  })

  const preview = jsx("scrollbox", {
    maxHeight: PREVIEW_HEIGHT,
    minHeight: 6,
    scrollbarOptions: { visible: true },
    children: jsx("markdown", {
      syntaxStyle: syntax,
      streaming: false,
      internalBlockMode: "top-level",
      tableOptions: { style: "grid" },
      conceal: true,
      fg: theme.markdownText,
      bg: theme.background,
      get content() {
        return selected().text
      },
    }),
  })

  const previewPane = jsxs("box", {
    flexDirection: "column",
    flexShrink: 0,
    border: ["top"],
    borderColor: theme.border,
    paddingTop: 1,
    paddingLeft: 4,
    paddingRight: 4,
    gap: 1,
    children: [previewHeader, preview],
  })

  return jsxs("box", {
    flexDirection: "column",
    flexGrow: 1,
    children: [picker, previewPane],
  }) as JSX.Element
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
      // DialogSelect fuzzy-searches `title`. Keep the full message here and
      // let the native dialog truncate only its rendered row.
      title: `${roleLabel(choice)} · ${searchable(choice.text)}`,
      footer: timeLabel(choice.created),
      value: choice,
    }))

    api.ui.dialog.setSize("xlarge")
    api.ui.dialog.replace(() => MessagePicker({ api, choices, options: selectOptions }))
  }

  api.keymap.registerLayer({
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
