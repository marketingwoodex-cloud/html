import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/tokens.css";
import "./styles/app.css";

/**
 * Where the console lives.
 *
 * `vite build --base=/admin-next/` writes asset URLs under `/admin-next/…`, and `import.meta.env.BASE_URL`
 * carries that same value into the bundle — so the router and the build cannot disagree about the mount
 * point. In `vite dev` the base is `/`, and the expression below turns that into the empty string, which is
 * BrowserRouter's own "mounted at the root" value.
 *
 * Why this line matters more than it looks: without a basename the router believed it owned the whole
 * origin. Every `<Link to="/leads">` then produced `https://host/leads`, the browser left the console, and
 * the host answered with the site's 404 — or, on a plain static server, with an empty body. Clicking any
 * sidebar item was a white screen, and so was a refresh on any screen whose URL the console had written.
 * The serving rules (host `.htaccess`, `tools/phpwasm/serve.cjs`) answer `/admin-next/<anything>` with the
 * app's `index.html`; this basename is what keeps the app *inside* `/admin-next/` so those rules are the
 * ones that ever matter.
 *
 * It is deliberately derived, never hard-coded: the same source builds the console at `/admin-next/`
 * (today) and at `/admin/` (a future `--base=/admin/`), with no second place to remember.
 */
const BASE = import.meta.env.BASE_URL;
const basename = BASE.replace(/\/+$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Outside the router, so a crash in a route still lands on the error screen rather than an empty body.
        A React render error unmounts the whole tree: without this, one bad prop renders nothing at all, and
        "nothing at all" is indistinguishable from a host that is down — the confusion this console spends
        every other screen avoiding by saying what is happening. */}
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
