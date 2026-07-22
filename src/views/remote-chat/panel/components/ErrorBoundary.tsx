// Panel-wide error boundary. Without it, any render throw in the chat/message tree
// unmounts the whole React root → a silent BLACK panel with no clue why. This catches
// the error, shows a legible fallback (with the message + a Reload button), and logs it
// so the actual cause is recoverable from devtools instead of a blank void.
import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in devtools for diagnosis (panel errors don't reach agent-debug.log).
    console.error("[panel] render crash:", error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="panel-crash" role="alert">
          <div className="panel-crash-title">Something broke while rendering.</div>
          <div className="panel-crash-msg">{this.state.error.message || String(this.state.error)}</div>
          <div className="panel-crash-actions">
            <button className="panel-crash-btn" onClick={() => location.reload()}>
              Reload
            </button>
            <button className="panel-crash-btn secondary" onClick={this.reset}>
              Dismiss
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
