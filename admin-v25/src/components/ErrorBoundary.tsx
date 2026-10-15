/* ============================================================================
   ERROR BOUNDARY — the last thing between a bug and a blank page.

   Why this file exists: a React render error unmounts the whole tree, and the
   browser shows nothing at all. That is the worst possible state for this
   console in particular, because "nothing on screen" is indistinguishable from
   "the host is down", "the API is down", "I am signed out" and "this screen is
   empty" — the four things every other screen in this app is careful to
   distinguish *in words*. Every one of those states has been given a sentence;
   a crash deserves one too, and the sentence should carry the actual error,
   because the person looking at it is often the person who can act on it.

   What it deliberately does not do:
     · it does not retry on its own — a render error retried in a loop is a
       browser tab that never settles;
     · it does not hide the message behind a friendly phrase;
     · it does not send anything anywhere. The panel is local, and the reload
       button is the only side effect.
   ========================================================================== */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    /* One line to the console, with the component stack, because that is what a developer pastes into a
       report. Nothing is invented for anyone else. */
    console.error("[wx] screen crashed:", error.message, info.componentStack);
    this.setState({ info: (info.componentStack ?? "").trim().split("\n").slice(0, 6).join("\n") });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "var(--s-6, 24px)",
          background: "var(--bg, #f6f7f9)",
          color: "var(--text, #101828)",
          font: "14px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            width: "100%",
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e4e7ec)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.65 }}>
            Woodex Admin v2.5 · screen stopped
          </div>
          <h1 style={{ fontSize: 20, margin: "8px 0 6px" }}>This screen crashed instead of rendering.</h1>
          <p style={{ margin: "0 0 14px", opacity: 0.85 }}>
            Nothing was saved, and nothing is being shown in its place — a page that quietly pretends to be
            fine is worse than this one. The rest of the console is unaffected: reload, or pick another
            screen from the sidebar.
          </p>
          <pre
            style={{
              margin: "0 0 14px",
              padding: 12,
              overflow: "auto",
              background: "var(--bg, #f6f7f9)",
              border: "1px solid var(--border, #e4e7ec)",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {e.name}: {e.message}
            {this.state.info ? "\n" + this.state.info : ""}
          </pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border, #e4e7ec)",
                background: "var(--brand, #1f4d3f)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Reload the console
            </button>
            <a
              href="/api/v2/health"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border, #e4e7ec)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Check the API (/api/v2/health)
            </a>
          </div>
        </div>
      </div>
    );
  }
}
