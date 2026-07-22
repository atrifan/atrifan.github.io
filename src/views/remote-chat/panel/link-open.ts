// Decide whether a chat-link click should navigate the CURRENT tab (keeping the side-panel
// chat) vs. defer to the browser's default (open a new tab/window). Same-tab navigation is
// the default for plain left-clicks on http(s) links; any explicit "new tab/window" intent
// (⌘/ctrl/shift, middle-click) or a non-http scheme is left to the browser.

interface ClickLike {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  button: number
}

export function shouldNavigateActiveTab(e: ClickLike, href: string | undefined): boolean {
  if (!href) return false
  if (!/^https?:\/\//i.test(href)) return false // only http(s); skip mailto/tel/#anchor/js:
  if (e.metaKey || e.ctrlKey || e.shiftKey) return false // user asked for new tab/window
  if (e.button !== 0) return false // not a primary-button click (e.g. middle-click)
  return true
}
