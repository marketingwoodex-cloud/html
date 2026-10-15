/* ⌘K command palette — searches the route registry, not the DOM.
   Because ROUTES is the single source of truth, a new screen is searchable the
   moment it is registered (v2.1 had no way to reach `integrations` at all). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { searchRoutes, type Role } from "../lib/nav";

export function CommandPalette({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchRoutes(q, role), [q, role]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      // focus after the overlay paints
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const go = (id: string) => {
    navigate(`/${id}`);
    onClose();
  };

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="row" style={{ borderBottom: "1px solid var(--border)" }}>
          <Search size={16} style={{ marginLeft: 16, color: "var(--text-subtle)" }} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search screens, e.g. quotations, whatsapp, backups…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && results[active]) go(results[active].id);
            }}
          />
          <kbd style={{ marginRight: 16 }}>esc</kbd>
        </div>

        <div className="palette-list">
          {results.length === 0 && (
            <p className="palette-empty">No screen matches “{q}”.</p>
          )}
          {results.map((r, i) => (
            <div
              key={r.id}
              className="palette-item"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.id)}
            >
              <r.icon size={16} />
              <div className="grow">
                <div style={{ fontSize: "var(--fs-13)", fontWeight: 550 }}>{r.label}</div>
                {r.hint && (
                  <div style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>{r.hint}</div>
                )}
              </div>
              {r.status === "planned" && <span className="nav-new">PLANNED</span>}
              <span className="grp">{r.group ?? r.section}</span>
              {i === active && <CornerDownLeft size={14} style={{ color: "var(--text-subtle)" }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
