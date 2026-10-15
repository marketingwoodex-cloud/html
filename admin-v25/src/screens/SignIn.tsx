/**
 * SignIn — the real one.
 *
 * `POST /auth/login`, then `POST /auth/login/2fa` when the
 * account has two-factor on, then `GET /me` to collect the session, the capabilities and the CSRF
 * token. The three states of the API are visible on this screen rather than hidden behind a spinner,
 * because "the server is down" and "your password is wrong" are different problems with different
 * answers, and v2.1 showed "Not signed in" for both.
 *
 * Nothing here stores a password, a token or a ticket outside React state: the session is an HttpOnly
 * cookie the browser holds, and the CSRF token comes back from `/me` on every reload.
 */
import { useState } from "react";
import { KeyRound, LogIn, ShieldCheck, WifiOff } from "lucide-react";
import { Btn, Input, Note, PageHead } from "../components/primitives";
import { useSession } from "../lib/session";
import { ApiFailure } from "../lib/api";

/**
 * The three states of the API — answering, answering-but-not-ready, and not answering at all — are on the
 * screen rather than behind a spinner, because "the server is down" and "your password is wrong" are
 * different problems with different answers, and v2.1 showed "Not signed in" for both.
 */
export function SignIn() {
  const { link, reason, health, signIn, signInTwoFactor, refreshHealth } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);

  const offline = link === "offline";
  /* The first paint is a fourth state, and it used to be the one nobody could see: the health probe is
     still in flight, no note is shown yet, and the button is live — so the first person to arrive after a
     deploy can press Sign in against a server that has not been found yet, and reads a request error rather
     than the truth. While the probe is running, the button says so and stays closed. */
  const checking = link === "checking";

  const fail = (err: unknown) => {
    if (err instanceof ApiFailure) {
      setError({ message: err.message, detail: err.detail });
    } else {
      setError({ message: "Something went wrong signing you in.", detail: "—" });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (ticket === null) {
        const res = await signIn(email.trim(), password);
        if (res.need2fa && res.ticket) {
          setTicket(res.ticket);
          setPassword("");
        }
      } else {
        await signInTwoFactor(ticket, code.trim());
      }
    } catch (err) {
      /* An expired 2FA ticket is not a failed sign-in: send the person back to the first step rather
         than leaving them typing codes into a form that is no longer listening. */
      if (ticket !== null && err instanceof ApiFailure && /expired/i.test(err.message)) setTicket(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={ticket ? "Two-factor code" : "Sign in to Woodex Admin"}
        sub={
          ticket
            ? "Open your authenticator app and enter the six-digit code."
            : "The studio's own console — website, quotes, projects and clients."
        }
      />
      <div style={{ maxWidth: 420 }}>
        {offline && (
          <div style={{ marginBottom: "var(--s-4)" }}>
            <Note tone="warn">
              <b><WifiOff size={13} /> api/v2 is not answering.</b>{" "}
              {reason ? `Reason: ${reason}. ` : ""}
              Signing in needs it: there is nothing behind this form to open a session. Nothing here is
              pre-filled and no session is being shown — check the host, then try again.
              <div className="row" style={{ marginTop: "var(--s-3)" }}>
                <Btn size="sm" onClick={refreshHealth}>Try again</Btn>
              </div>
            </Note>
          </div>
        )}

        {checking && (
          <div style={{ marginBottom: "var(--s-4)" }}>
            <Note tone="info">
              <b>Looking for api/v2…</b> The form is ready; the button opens as soon as the API answers.
            </Note>
          </div>
        )}

        {health && !health.ready && !offline && (
          <div style={{ marginBottom: "var(--s-4)" }}>
            <Note tone="warn">
              <b>The API is answering but not ready.</b>{" "}
              {!health.db.reachable
                ? "The database is not reachable."
                : !health.db.migrated
                  ? "The database has not been migrated yet — run `php db/migrate.php` on the host."
                  : "A required table is missing."}{" "}
              Sign-in will not work until that is fixed.
            </Note>
          </div>
        )}

        <form onSubmit={submit}>
          {ticket === null ? (
            <>
              {/* `type="text"`, not `type="email"`: the account the studio actually signs in with is the
                  one v2.1's first run wrote, and its name is `admin` — a bare name the browser refuses to
                  submit from an email field. The server looks the name up as written, so the form must not
                  be the thing that decides what a sign-in name may look like. */}
              <label className="field-label" htmlFor="email">Email or sign-in name</label>
              <Input
                id="email"
                name="email"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@woodex.com.pk"
                required
                autoFocus
              />
              <label className="field-label" htmlFor="password" style={{ marginTop: "var(--s-3)" }}>
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="code">
                <ShieldCheck size={13} /> Code from your app
              </label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                autoFocus
              />
              <p style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginTop: "var(--s-2)" }}>
                Lost your phone? A recovery code works here too.
              </p>
            </>
          )}

          {error && (
            <div style={{ marginTop: "var(--s-3)" }}>
              <Note tone="danger">
                <b>{error.message}</b>
                <div className="mono" style={{ fontSize: "var(--fs-11)", marginTop: 4 }}>{error.detail}</div>
              </Note>
            </div>
          )}

          <div className="row" style={{ marginTop: "var(--s-4)", gap: "var(--s-2)" }}>
            <Btn variant="primary" type="submit" disabled={busy || offline || checking}>
              {ticket ? <KeyRound size={15} /> : <LogIn size={15} />}
              {busy ? "Working…" : checking ? "Checking the server…" : ticket ? "Verify code" : "Sign in"}
            </Btn>
            {ticket && (
              <Btn type="button" onClick={() => { setTicket(null); setCode(""); setError(null); }}>
                Back
              </Btn>
            )}
          </div>
        </form>

        <p style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginTop: "var(--s-4)" }}>
          The session lives in a cookie this browser holds — no token is written into the page. After
          twelve hours of inactivity you will be asked to sign in again, and any screen that was open
          will say so rather than keep showing numbers that may have moved.
        </p>

        {/* Which build this door belongs to. A sign-in screen is where "have I got the new build?" is
            asked, and the answer has to come from the build rather than from a refresh. */}
        <p className="build-stamp">v2.5 · {__WX_BUILD__}</p>
      </div>
    </>
  );
}
