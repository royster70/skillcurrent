/**
 * ExplainDisclosure — the "Explain this score" control (GitHub #79).
 *
 * The single progressive-disclosure pattern for measurement jargon: ordinary
 * surfaces show plain words; anyone who wants the mechanics opens this and
 * gets the shared explainer plus a deep link into the methodology page's
 * matching section. Generalises ContextualScoreCard's "?" popover so new
 * surfaces (zone chips, β readouts, tide chips, coverage badges) don't each
 * invent their own.
 *
 * Accessible by construction (pre-work for the #75 a11y pass): a real
 * <button> trigger with aria-expanded/aria-controls, Escape to close.
 */

import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { THEME, TYPE } from "../lib/constants";
import type { Explainer } from "../lib/lexicon";

const t = THEME.light;

export function ExplainDisclosure({
  explainer,
  trigger = "icon",
  label = "Explain this score",
}: {
  explainer: Explainer;
  /** "icon" renders the compact "?" button; "text" renders the label inline. */
  trigger?: "icon" | "text";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const triggerStyle: React.CSSProperties =
    trigger === "icon"
      ? {
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1px solid ${t.line}`,
          backgroundColor: open ? t.brass : t.ground,
          color: open ? "#fff" : t.inkMuted,
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
          verticalAlign: "middle",
        }
      : {
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: TYPE.body,
          fontSize: 11.5,
          fontWeight: 600,
          color: t.brass,
          textDecoration: "underline dotted",
          textUnderlineOffset: 3,
        };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title={explainer.title}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        style={triggerStyle}
      >
        {trigger === "icon" ? "?" : label}
      </button>

      {open && (
        <span
          id={panelId}
          role="note"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 20,
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: t.surface,
            border: `1px solid ${t.line}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            width: 260,
            display: "block",
            textAlign: "left",
            fontFamily: TYPE.body,
          }}
        >
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.ink, marginBottom: 4 }}>
            {explainer.title}
          </span>
          <span style={{ display: "block", fontSize: 11, color: t.inkMuted, lineHeight: 1.5, marginBottom: 6 }}>
            {explainer.body}
          </span>
          <Link
            to={`/methodology${explainer.anchor}`}
            style={{ fontSize: 11, fontWeight: 600, color: t.brass, textDecoration: "none" }}
          >
            How it works →
          </Link>
        </span>
      )}
    </span>
  );
}
