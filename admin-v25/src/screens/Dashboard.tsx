/* Dashboard — the master overview.
   Layout rule from the v2.1 audit (U1.2): KPI row is always 4-up with a 16px
   gap; every screen starts with an H1 + breadcrumb (U1.1, 57/57 routes). */
import { Note, PageHead } from "../components/primitives";
import type { Role } from "../lib/nav";
import { useSession } from "../lib/session";
import { LiveDashboard } from "./LiveDashboard";

/**
 * Two states, and the second one is a sentence rather than a sample.
 *
 * When api/v2 answers, the screen is the server's numbers (`LiveDashboard`). When it does not, it says so —
 * and shows nothing else. This screen used to draw the design's KPI row, revenue chart and activity feed
 * whenever the API was missing, under a strip that said the host was not answering: a dashboard is the one
 * screen where an invented number reads as a real one, and "we cannot read your figures" is a different
 * sentence from "here are your figures". Nothing stands in for them now.
 */
export function Dashboard({ role }: { role: Role }) {
  const { link, me, reason } = useSession();
  if (link === "live" && me) return <LiveDashboard role={role} />;
  return (
    <>
      <PageHead title="Dashboard" sub="Studio KPIs, revenue and what needs attention" />
      <Note tone="warn" title="Not connected">
        {link === "checking"
          ? "Still looking for api/v2 — the console has not heard back from its own host yet, so there are no numbers to show."
          : link === "offline"
            ? `api/v2 is not answering, so the studio's figures cannot be read. Nothing stands in for them: a dashboard is the one screen where an invented number reads as a real one.${reason ? ` (${reason})` : ""}`
            : "Sign in to see the studio's numbers."}
      </Note>
    </>
  );
}
