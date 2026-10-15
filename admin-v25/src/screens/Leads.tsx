/* Leads — the workhorse table.
   Shows the filters, saved views, bulk actions and inline stage control that
   the v2.1 table lacked, plus the data-quality guard the audit asked for:
   a row can never claim a channel or value the backend did not send. */
import { Note, PageHead } from "../components/primitives";
import { useSession } from "../lib/session";
import { LiveLeads } from "./LiveLeads";

/**
 * The server's rows, or a sentence — never a sample.
 *
 * `LiveLeads` does its filtering and paging on the server, and this screen only decides which of the two
 * states is true. It used to fall back to the design's own forty-one invented enquiries whenever the API was
 * missing: a table of names and phone numbers that are not the studio's clients reads as a client list, and
 * the count above it reads as a workload. An empty screen with a reason is the honest answer.
 */
export function Leads() {
  const { link, me, reason } = useSession();
  if (link === "live" && me) return <LiveLeads />;
  return (
    <>
      <PageHead title="Enquiries" sub="Every enquiry, from every channel" />
      <Note tone="warn" title="Not connected">
        {link === "checking"
          ? "Still looking for api/v2 — the console has not heard back from its own host yet, so there are no rows to show."
          : link === "offline"
            ? `api/v2 is not answering, so the enquiries cannot be read. A table of names and phone numbers that are not your clients is worse than an empty screen, so nothing is shown.${reason ? ` (${reason})` : ""}`
            : "Sign in to see the enquiries."}
      </Note>
    </>
  );
}
