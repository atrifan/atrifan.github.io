import { useMemo } from "react"

interface Message {
  user: string
  text: string
  ts?: string
  isMe?: boolean
}

export type MessagesData =
  | Message[]
  | { type: string; messages: Message[] }

interface Props {
  data: MessagesData
}

const EMOJI_MAP: Record<string, string> = {
  slightly_smiling_face: "\u{1F642}", smile: "\u{1F604}", laughing: "\u{1F606}", blush: "\u{1F60A}",
  wink: "\u{1F609}", heart_eyes: "\u{1F60D}", kissing_heart: "\u{1F618}", thinking_face: "\u{1F914}",
  raised_hands: "\u{1F64C}", clap: "\u{1F44F}", fire: "\u{1F525}", tada: "\u{1F389}",
  rocket: "\u{1F680}", thumbsup: "\u{1F44D}", thumbsdown: "\u{1F44E}", ok_hand: "\u{1F44C}",
  wave: "\u{1F44B}", pray: "\u{1F64F}", muscle: "\u{1F4AA}", eyes: "\u{1F440}",
  heart: "\u{2764}\u{FE0F}", broken_heart: "\u{1F494}", star: "\u{2B50}", sparkles: "\u{2728}",
  zap: "\u{26A1}", warning: "\u{26A0}\u{FE0F}", white_check_mark: "\u{2705}", x: "\u{274C}",
  heavy_check_mark: "\u{2714}\u{FE0F}", bangbang: "\u{203C}\u{FE0F}", question: "\u{2753}",
  exclamation: "\u{2757}", plus1: "\u{1F44D}", "-1": "\u{1F44E}", point_up: "\u{261D}\u{FE0F}",
  point_down: "\u{1F447}", point_left: "\u{1F448}", point_right: "\u{1F449}",
  raising_hand: "\u{1F64B}", see_no_evil: "\u{1F648}", hear_no_evil: "\u{1F649}", speak_no_evil: "\u{1F64A}",
  sweat_smile: "\u{1F605}", joy: "\u{1F602}", sob: "\u{1F62D}", angry: "\u{1F620}", rage: "\u{1F621}",
  sunglasses: "\u{1F60E}", nerd_face: "\u{1F913}", confused: "\u{1F615}", worried: "\u{1F61F}",
  hushed: "\u{1F62F}", astonished: "\u{1F632}", flushed: "\u{1F633}", scream: "\u{1F631}",
  skull: "\u{1F480}", ghost: "\u{1F47B}", alien: "\u{1F47D}", robot_face: "\u{1F916}",
  hankey: "\u{1F4A9}", smiley: "\u{1F603}", grinning: "\u{1F600}", innocent: "\u{1F607}",
  smirk: "\u{1F60F}", unamused: "\u{1F612}", disappointed: "\u{1F61E}", pensive: "\u{1F614}",
  sleeping: "\u{1F634}", mask: "\u{1F637}", bulb: "\u{1F4A1}", memo: "\u{1F4DD}",
  chart_with_upwards_trend: "\u{1F4C8}", chart_with_downwards_trend: "\u{1F4C9}",
  computer: "\u{1F4BB}", email: "\u{1F4E7}", phone: "\u{1F4F1}", calendar: "\u{1F4C5}",
  lock: "\u{1F512}", unlock: "\u{1F513}", key: "\u{1F511}", hammer: "\u{1F528}",
  link: "\u{1F517}", gear: "\u{2699}\u{FE0F}", pushpin: "\u{1F4CC}", scissors: "\u{2702}\u{FE0F}",
  package: "\u{1F4E6}", truck: "\u{1F69A}", airplane: "\u{2708}\u{FE0F}", hourglass: "\u{231B}",
  stopwatch: "\u{23F1}\u{FE0F}", bomb: "\u{1F4A3}", trophy: "\u{1F3C6}",
  football: "\u{26BD}", basketball: "\u{1F3C0}", baseball: "\u{26BE}", tennis: "\u{1F3BE}",
  "100": "\u{1F4AF}", checkered_flag: "\u{1F3C1}",
  rotating_light: "\u{1F6A8}", bell: "\u{1F514}", no_bell: "\u{1F515}",
  loudspeaker: "\u{1F4E2}", mega: "\u{1F4E3}", speech_balloon: "\u{1F4AC}",
  thought_balloon: "\u{1F4AD}", arrow_right: "\u{27A1}\u{FE0F}", arrow_left: "\u{2B05}\u{FE0F}",
  arrow_up: "\u{2B06}\u{FE0F}", arrow_down: "\u{2B07}\u{FE0F}", red_circle: "\u{1F534}",
  large_blue_circle: "\u{1F535}", white_circle: "\u{26AA}", black_circle: "\u{26AB}",
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function convertEmojis(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/g, (full, name) => EMOJI_MAP[name] ?? full)
}

function convertGenericMarkup(raw: string): string {
  let result = escapeHtml(raw)
  result = convertEmojis(result)
  result = result.replace(/\n/g, "<br>")
  return result
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function convertSlackMarkup(raw: string): string {
  // First: extract Slack links before HTML escaping (they use < >)
  const links: string[] = []
  const linkPlaceholder = raw.replace(/<(https?:\/\/[^>]+)>/g, (_, url) => {
    const idx = links.length
    const pipeIdx = url.indexOf("|")
    if (pipeIdx > -1) {
      links.push(`<a href="${escapeAttr(url.slice(0, pipeIdx))}" target="_blank" rel="noopener noreferrer">${escapeHtml(url.slice(pipeIdx + 1))}</a>`)
    } else {
      links.push(`<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)
    }
    return `\x00LINK_${idx}\x00`
  })

  // Extract mentions before escaping
  const mentions: string[] = []
  const mentionPlaceholder = linkPlaceholder.replace(/<@([A-Z0-9]+)>/g, (_, id) => {
    const idx = mentions.length
    mentions.push(`<span class="msg-mention">@${id}</span>`)
    return `\x00MENTION_${idx}\x00`
  })

  // Now safe to escape HTML
  let result = escapeHtml(mentionPlaceholder)

  // Convert emojis
  result = convertEmojis(result)

  // Bold: *text*
  result = result.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<strong>$1</strong>")
  // Italic: _text_
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<em>$1</em>")
  // Strike: ~text~
  result = result.replace(/(?<!\w)~([^~\n]+)~(?!\w)/g, "<del>$1</del>")
  // Code: `text`
  result = result.replace(/`([^`\n]+)`/g, "<code>$1</code>")

  // Restore links and mentions
  result = result.replace(/\x00LINK_(\d+)\x00/g, (_, idx) => links[parseInt(idx)])
  result = result.replace(/\x00MENTION_(\d+)\x00/g, (_, idx) => mentions[parseInt(idx)])

  // Newlines to <br>
  result = result.replace(/\n/g, "<br>")

  return result
}

function formatTimestamp(ts?: string): string {
  if (!ts) return ""
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) {
      const epoch = parseFloat(ts) * 1000
      if (!isNaN(epoch)) {
        const date = new Date(epoch)
        return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      }
      return ts
    }
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch {
    return ts
  }
}

export function MessagesBlock({ data }: Props) {
  const messages = Array.isArray(data) ? data : data.messages
  const providerType = Array.isArray(data) ? "slack" : (data.type || "generic")
  const convert = providerType === "slack" ? convertSlackMarkup : convertGenericMarkup

  const rendered = useMemo(() => messages.map((m, i) => ({
    ...m,
    html: convert(m.text || ""),
    time: formatTimestamp(m.ts),
    key: i,
  })), [messages, convert])

  return (
    <div className="messages-block">
      {rendered.map((m) => (
        <div key={m.key} className={`msg-item${m.isMe ? " msg-me" : ""}`}>
          <div className="msg-header">
            <span className="msg-user">{m.user}</span>
            {m.time && <span className="msg-time">{m.time}</span>}
          </div>
          <div className="msg-text" dangerouslySetInnerHTML={{ __html: m.html }} />
        </div>
      ))}
    </div>
  )
}
