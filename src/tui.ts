import type {
  TuiDialogSelectOption,
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui"
import { RGBA, SyntaxStyle } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { jsx, jsxs, type JSX } from "@opentui/solid/jsx-runtime"
import { createSignal } from "solid-js"
import { copyPlainText } from "./clipboard.ts"

const COMMAND = "message-copy.open"
const CLOSE_COMMAND = "message-copy.close"
const MODE = "message-copy"
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

type PickerState = {
  choices: Choice[]
  options: TuiDialogSelectOption<Choice>[]
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

function copyChoice(api: TuiPluginApi, choice: Choice, close: () => void) {
  close()

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
  state: PickerState
  close: () => void
}): JSX.Element {
  const [selected, setSelected] = createSignal(props.state.choices[0]!)
  const dimensions = useTerminalDimensions()
  const theme = props.api.theme.current
  const syntax = createSyntaxStyle(props.api)

  const panelWidth = () => Math.max(1, Math.min(dimensions().width - 2, Math.floor(dimensions().width * 0.8)))
  const panelHeight = () => Math.max(1, Math.min(dimensions().height - 2, Math.floor(dimensions().height * 0.8)))

  const picker = props.api.ui.DialogSelect<Choice>({
    title: "Messages",
    placeholder: "Fuzzy search full message text",
    options: props.state.options,
    flat: true,
    onMove(option) {
      setSelected(option.value)
    },
    onSelect(option) {
      copyChoice(props.api, option.value, props.close)
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
    width: "100%",
    height: "100%",
    flexGrow: 1,
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

  const listPane = jsx("box", {
    width: "42%",
    height: "100%",
    flexShrink: 0,
    border: ["right"],
    borderColor: theme.border,
    children: picker,
  })

  const previewPane = jsxs("box", {
    flexDirection: "column",
    flexGrow: 1,
    height: "100%",
    minWidth: 1,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    gap: 1,
    children: [previewHeader, preview],
  })

  const content = jsxs("box", {
    flexDirection: "row",
    flexGrow: 1,
    minHeight: 1,
    children: [listPane, previewPane],
  })

  const header = jsxs("box", {
    flexDirection: "row",
    justifyContent: "space-between",
    flexShrink: 0,
    paddingLeft: 2,
    paddingRight: 2,
    paddingBottom: 1,
    children: [
      jsx("text", { fg: theme.text, children: "Copy message" }),
      jsx("text", {
        fg: theme.textMuted,
        onMouseUp: props.close,
        children: "esc",
      }),
    ],
  })

  const panel = jsxs("box", {
    get width() {
      return panelWidth()
    },
    get height() {
      return panelHeight()
    },
    flexDirection: "column",
    backgroundColor: theme.backgroundPanel,
    border: true,
    borderColor: theme.border,
    paddingTop: 1,
    onMouseUp(event: { stopPropagation(): void }) {
      event.stopPropagation()
    },
    children: [header, content],
  })

  return jsx("box", {
    get width() {
      return dimensions().width
    },
    get height() {
      return dimensions().height
    },
    position: "absolute",
    zIndex: 3500,
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: RGBA.fromInts(0, 0, 0, 160),
    onMouseUp: props.close,
    children: panel,
  }) as JSX.Element
}

const tui: TuiPlugin = async (api, rawOptions) => {
  const options = readOptions(rawOptions)
  const [picker, setPicker] = createSignal<PickerState>()
  let popMode: (() => void) | undefined
  let restoreFocus: (() => void) | undefined

  const close = () => {
    setPicker(undefined)
    popMode?.()
    popMode = undefined
    restoreFocus?.()
    restoreFocus = undefined
  }

  const slot: TuiSlotPlugin = {
    slots: {
      app() {
        const state = picker()
        if (!state) return null
        return MessagePicker({ api, state, close })
      },
    },
  }
  api.slots.register(slot)
  api.lifecycle.onDispose(close)

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

    const focused = api.renderer.currentFocusedRenderable
    restoreFocus = () => {
      setTimeout(() => {
        if (!focused || focused.isDestroyed) return
        focused.focus()
      }, 1)
    }
    setPicker({ choices, options: selectOptions })
    if (!popMode) popMode = api.mode.push(MODE)
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

  api.keymap.registerLayer({
    mode: MODE,
    commands: [
      {
        name: CLOSE_COMMAND,
        title: "Close message picker",
        run: close,
      },
    ],
    bindings: [
      { key: "escape", cmd: CLOSE_COMMAND, desc: "Close message picker" },
      { key: "ctrl+c", cmd: CLOSE_COMMAND, desc: "Close message picker" },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-message-copy",
  tui,
}

export default plugin
