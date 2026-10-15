/**
 * session.tsx — who is signed in, and which data the screens are allowed to show.
 *
 * This is the piece a mock-data screen cannot have: a real session. The SPA starts by asking the API two
 * questions — "are you there and healthy?" (`GET /health`, no session needed) and "who am I?"
 * (`GET /me`, which answers AUTH if nobody is) — and everything else follows from the answers.
 *
 * **There are exactly three links, and the difference between them is shown, not inferred:**
 *
 *   · `live` — the API answered `/me`. Screens call api/v2 and show what it sent.
 *   · `signedOut` — the API is there and healthy, nobody is signed in. The sign-in screen.
 *   · `offline` — no API (a static preview, a host that has not been migrated, a network failure).
 *     Nothing is invented: the shell names the state, and each screen says the same thing in its own words.
 *
 * Sample data was removed from this console entirely — there is no flag, no query string and no fixture left.
 * A screen showing invented numbers is worse than no screen, because somebody will believe the numbers, and
 * a "demo" that looks like the product is the same lie with a caption. When the API answers and is not ready,
 * the shell says which check failed, and when it does not answer, every screen says that instead.
 *
 * The health probe is polled every 60 seconds, because the interesting case is a host that was up when
 * the tab opened and is not now — that is exactly when the old admin kept showing stale data.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiFailure, api, session as sessionApi, setCsrf, onAuthFailure, type MeResponse, type User } from "./api";
import type { Health } from "./live";

export type LinkState = "checking" | "offline" | "signedOut" | "live";

export interface SessionValue {
  link: LinkState;
  /** Why the link is offline, in words a person can act on. Empty when it is not. */
  reason: string;
  health: Health | null;
  me: MeResponse | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<{ need2fa: boolean; ticket?: string }>;
  signInTwoFactor: (ticket: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshHealth: () => void;
}

/**
 * The context is exported for one reason: the render smoke test has to be able to put the app into a
 * state that only a real server can produce (signed in, API answering). Nothing in the app uses it
 * directly — `<SessionProvider>` is the only writer.
 */
export const SessionCtx = createContext<SessionValue | null>(null);
const Ctx = SessionCtx;

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession() outside <SessionProvider>");
  return v;
}

/** A cached CSRF token on a hard reload is stale; the API refuses it, and the refetch below fixes it. */
const MAX_HEALTH_FAILURES = 3;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [link, setLink] = useState<LinkState>("checking");
  const [reason, setReason] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const failures = useRef(0);
  const alive = useRef(true);

  const probe = useCallback(async () => {
    try {
      const h = await api.get<Health>("/health", { retries: 0, quiet: true });
      if (!alive.current) return;
      setHealth(h);
      failures.current = 0;
      setReason(h.ready ? "" : "the platform is not fully ready");
      /* Reachable but not ready still counts as reachable: the sign-in screen would fail anyway, and
         the reason belongs in one place — the shell. */
      setLink((cur) => (cur === "live" ? cur : "signedOut"));
      return true;
    } catch (err) {
      if (!alive.current) return false;
      failures.current += 1;
      const why = err instanceof ApiFailure ? err.message : "the request failed";
      if (failures.current >= MAX_HEALTH_FAILURES) {
        setLink((cur) => (cur === "live" ? cur : "offline"));
        setReason(why === "The server could not be reached." ? "" : why);
      }
      return false;
    }
  }, []);

  /* Boot: health first (so an offline preview settles fast), then the session. */
  useEffect(() => {
    alive.current = true;
    (async () => {
      let reachable = await probe();
      const up = reachable;
      if (!alive.current) return;
      if (!up) {
        /* Three quick attempts, then stop: a static preview should not hammer a host that is not there. */
        for (let i = 0; i < MAX_HEALTH_FAILURES - 1; i++) {
          await new Promise((r) => window.setTimeout(r, 400 * (i + 1)));
          if (!alive.current) return;
          // eslint-disable-next-line no-await-in-loop
          if (await probe()) {
            reachable = true;
            break;
          }
        }
      }
      if (!alive.current) return;
      try {
        const who = await sessionApi.me();
        if (!alive.current) return;
        if (who) {
          setCsrf(who.csrf);
          setMe(who);
          setLink("live");
        } else {
          setLink("signedOut");
        }
      } catch {
        /* A `/me` that *failed* is not a "/me that said no". When the health probe has already concluded
           the host is unreachable, this must not turn into a sign-in form: a door that cannot open is worse
           than a notice that says the host is not answering, because it invites a password into nothing.
           (This is exactly what a preview with no PHP behind it used to do.) */
        if (alive.current && reachable) setLink("signedOut");
      }
    })();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Steady state: a health check a minute, because the interesting failure is a host that stops. */
  useEffect(() => {
    const id = window.setInterval(() => {
      void probe();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [probe]);

  /* The API says "sign in again" (session expired, password changed elsewhere). One handler, so every
     screen behaves the same way instead of each deciding what a 401 means. */
  useEffect(() => {
    onAuthFailure(() => {
      setCsrf(null);
      setMe(null);
      setLink((cur) => (cur === "checking" ? cur : "signedOut"));
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await sessionApi.login(email, password);
    if (res.need2fa) return { need2fa: true, ticket: res.ticket };
    const who = await sessionApi.me();
    if (who) {
      setMe(who);
      setLink("live");
    }
    return { need2fa: false };
  }, []);

  const signInTwoFactor = useCallback(async (ticket: string, code: string) => {
    await sessionApi.loginTwoFactor(ticket, code);
    const who = await sessionApi.me();
    if (who) {
      setMe(who);
      setLink("live");
    }
  }, []);

  const signOut = useCallback(async () => {
    await sessionApi.logout();
    setMe(null);
    setCsrf(null);
    setLink("signedOut");
  }, []);

  const refreshHealth = useCallback(() => {
    void probe();
  }, [probe]);

  const value = useMemo<SessionValue>(
    () => ({ link, reason, health, me, user: me?.user ?? null, signIn, signInTwoFactor, signOut, refreshHealth }),
    [link, reason, health, me, signIn, signInTwoFactor, signOut, refreshHealth],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
