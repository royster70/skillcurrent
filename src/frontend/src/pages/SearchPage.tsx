import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, IS_STATIC, type SearchResult } from "../lib/api";
import { THEME, TYPE, BRASS_TINT, ZONE_COLORS, ZONE_LABELS, ZONE_TITLES, SIGNAL_COLORS } from "../lib/constants";
import { CurrentFlow } from "../components/current/CurrentFlow";
import { Waypoint } from "../components/Waypoint";
import { DUR, EASE } from "../components/current/motion";
import { IconCompass, IconTextLines, IconSearch, IconWaterline } from "../components/current/icons";

const t = THEME.light;

// Match-quality shading — deliberately NOT ZONE_COLORS: a similarity score is
// not an exposure zone, and reusing zone hues here would imply an automation
// reading a text match never carries. Same warm-instrument family, own scale.
const MATCH_COLORS = {
  high: { bg: "#e6f2ee", fg: "#0d8f6e" },
  mid: { bg: "#f6efe6", fg: "#9c6414" },
  low: { bg: "#f6e9e9", fg: "#b23b3b" },
} as const;

type SearchMode = "text" | "semantic";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [description, setDescription] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<SearchMode>("semantic");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();

  // Accepts an explicit term so the suggestion chips can search immediately —
  // setQuery() is async, so a chip can't set state then read it back this tick.
  // Same reason `m` is a parameter: the failure-fallback button switches mode
  // and re-searches in one click.
  const handleSearch = async (q: string = query, m: SearchMode = mode) => {
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);
    setFailed(false);
    try {
      if (m === "semantic") {
        const data = await api.semanticSearch(q, description || undefined);
        setResults(data.results);
      } else {
        const data = await api.search(q);
        setResults(data.results);
      }
    } catch {
      // A failed request is NOT "no matches" — surface it as its own state so
      // an outage never masquerades as a genuine zero-result search.
      setResults([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) handleSearch();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000, fontFamily: TYPE.body, color: t.ink }}>
      <div>
        <Waypoint>FIND YOUR ROLE</Waypoint>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>
          Search for a role
        </h1>
        <p style={{ fontSize: 14, color: t.inkMuted, margin: "6px 0 0" }}>
          Search 66,500+ job titles using{" "}
          {mode === "semantic"
            ? IS_STATIC ? "fuzzy title matching" : "AI-powered semantic matching"
            : "text matching"}
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${t.line}`, overflow: "hidden" }}>
          <button
            onClick={() => setMode("semantic")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", fontSize: 13, fontWeight: mode === "semantic" ? 600 : 500,
              border: "none", cursor: "pointer", fontFamily: TYPE.body,
              backgroundColor: mode === "semantic" ? BRASS_TINT : t.surface,
              color: mode === "semantic" ? t.brass : t.inkMuted,
              transition: `all ${DUR.hover}ms ${EASE}`,
            }}
          >
            <IconCompass size={15} /> {IS_STATIC ? "Best match" : "Semantic"}
          </button>
          <button
            onClick={() => setMode("text")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", fontSize: 13, fontWeight: mode === "text" ? 600 : 500,
              border: "none", borderLeft: `1px solid ${t.line}`, cursor: "pointer", fontFamily: TYPE.body,
              backgroundColor: mode === "text" ? BRASS_TINT : t.surface,
              color: mode === "text" ? t.brass : t.inkMuted,
              transition: `all ${DUR.hover}ms ${EASE}`,
            }}
          >
            <IconTextLines size={15} /> Text match
          </button>
        </div>
        <span style={{ fontSize: 12, color: t.inkMuted }}>
          {mode === "semantic"
            ? IS_STATIC
              // Honesty over gloss: the static build has no embedding model, so
              // "semantic" here is really the same trigram fuzzy match ranked a
              // little differently. Say so rather than claim AI matching.
              ? "Static build — fuzzy title matching over the same corpus. Full semantic search runs in the self-hosted build."
              : "Understands meaning — matches roles by what they do, not just keywords"
            : "Matches by text similarity — exact phrases and fuzzy matching"}
        </span>
      </div>

      {/* Search inputs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Job title... e.g. 'DevOps Engineer', 'Clinical Psychologist', 'Data Architect'"
            style={{
              flex: 1, minWidth: 220, padding: "12px 16px", fontSize: 16, borderRadius: 10,
              border: `1.5px solid ${focused ? t.brass : t.line}`, outline: "none",
              fontFamily: TYPE.body, color: t.ink, background: t.surface,
              transition: `border-color ${DUR.hover}ms ${EASE}`,
            }}
          />
          <button
            onClick={() => handleSearch()}
            disabled={query.length < 2 || loading}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 22px", fontSize: 14, fontWeight: 600, borderRadius: 10,
              border: "none", backgroundColor: t.brass, color: "#fff", cursor: "pointer",
              opacity: query.length < 2 ? 0.5 : 1, fontFamily: TYPE.body,
            }}
          >
            {loading ? (
              <>
                <CurrentFlow direction="right" length={30} breadth={12} strokes={1} color="#fff" opacity={0.8} speed={1.6} />
                Reading the current…
              </>
            ) : (
              <>
                <IconSearch size={15} /> Search
              </>
            )}
          </button>
        </div>

        {/* Job description input (semantic mode) */}
        {mode === "semantic" && (
          <div>
            <label style={{ fontSize: 12, color: t.inkMuted, fontWeight: 500 }}>
              Optional: paste a job description for more accurate matching
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste the job description here to improve matching accuracy..."
              rows={4}
              style={{
                width: "100%", padding: "12px 16px", fontSize: 14, borderRadius: 10,
                border: `1.5px solid ${t.line}`, outline: "none", resize: "vertical",
                fontFamily: TYPE.body, color: t.ink, background: t.surface, marginTop: 4,
              }}
            />
          </div>
        )}
      </div>

      {/* Failure — a distinct state from "no matches", so an unavailable
          service never reads as a genuine zero-result search */}
      {searched && !loading && failed && (
        <div style={{ padding: "48px 0", textAlign: "center", color: t.inkMuted }}>
          <div style={{ opacity: 0.35, marginBottom: 10, display: "flex", justifyContent: "center" }}>
            <IconWaterline size={30} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.ink }}>Search is unavailable right now</div>
          <div style={{ fontSize: 13.5, marginTop: 6 }}>
            The search service didn't respond — this isn't a "no matches" result.
            Check your connection, then retry.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => handleSearch()}
              style={{
                padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: "none", backgroundColor: t.brass, color: "#fff", cursor: "pointer", fontFamily: TYPE.body,
              }}
            >
              Retry
            </button>
            {mode === "semantic" && !IS_STATIC && (
              <button
                onClick={() => { setMode("text"); handleSearch(query, "text"); }}
                style={{
                  padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                  border: `1px solid ${t.line}`, backgroundColor: t.surface, color: t.inkMuted,
                  cursor: "pointer", fontFamily: TYPE.body,
                }}
              >
                Try text match instead
              </button>
            )}
          </div>
        </div>
      )}

      {/* Genuine zero-result search */}
      {searched && !loading && !failed && results.length === 0 && (
        <div style={{ padding: "48px 0", textAlign: "center", color: t.inkMuted }}>
          <div style={{ opacity: 0.35, marginBottom: 10, display: "flex", justifyContent: "center" }}>
            <IconWaterline size={30} />
          </div>
          <div style={{ fontSize: 15 }}>No occupations found for "{query}". Try a different job title.</div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: t.inkMuted, marginBottom: 4 }}>
            {results.length} occupation{results.length !== 1 ? "s" : ""} matching "{query}"
            {mode === "semantic" && (IS_STATIC ? " (best match)" : " (semantic)")}
          </div>

          {results.map((r) => (
            <ResultRow key={r.soc_code} r={r} onOpen={() => r.has_tasks && navigate(`/occupations?selected=${r.soc_code}`)} />
          ))}
        </div>
      )}

      {/* Quick suggestions */}
      {!searched && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <div style={{ fontSize: 13, color: t.inkMuted, fontWeight: 600 }}>Try searching for:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              "DevOps Engineer", "Clinical Psychologist", "Data Architect",
              "UX Researcher", "Supply Chain Analyst", "Compliance Officer",
              "Machine Learning Engineer", "Financial Controller",
            ].map((term) => (
              <button
                key={term}
                onClick={() => { setQuery(term); handleSearch(term); }}
                style={{
                  padding: "6px 14px", fontSize: 13, borderRadius: 20,
                  border: `1px solid ${t.line}`, backgroundColor: t.surface, cursor: "pointer",
                  fontFamily: TYPE.body, color: t.inkMuted,
                  transition: `border-color ${DUR.hover}ms ${EASE}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.brass)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.line)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ r, onOpen }: { r: SearchResult; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const clickable = r.has_tasks;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: r.category ? t.ground : t.surface,
        borderRadius: 10,
        border: `1.5px solid ${clickable && hovered ? t.brass : t.line}`,
        padding: 16, cursor: clickable ? "pointer" : "default",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", transition: `border-color ${DUR.hover}ms ${EASE}`,
        opacity: r.category ? 0.8 : 1,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{r.occupation_title}</span>
          {(r.category === "residual" || r.category === "military") && (
            <span
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                backgroundColor: t.ground, color: t.inkMuted, border: `1px solid ${t.line}`,
              }}
            >
              {r.category === "residual" ? "Catch-all category" : "Military"}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: t.inkMuted, marginTop: 2, fontFamily: TYPE.mono }}>
          {r.soc_code} <span style={{ fontFamily: TYPE.body }}>· Matched: "{r.matched_title}"</span>
          {r.similarity != null && r.similarity < 1.0 && (
            <span
              style={{
                marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4,
                backgroundColor: r.similarity > 0.5 ? MATCH_COLORS.high.bg : r.similarity > 0.3 ? MATCH_COLORS.mid.bg : MATCH_COLORS.low.bg,
                color: r.similarity > 0.5 ? MATCH_COLORS.high.fg : r.similarity > 0.3 ? MATCH_COLORS.mid.fg : MATCH_COLORS.low.fg,
              }}
            >
              {Math.round(r.similarity * 100)}% match
            </span>
          )}
        </div>
        {r.category && (
          <div style={{ fontSize: 11, color: t.inkMuted, marginTop: 4, fontStyle: "italic" }}>
            {r.category === "residual"
              ? 'This is an "All Other" residual category — task-level data is not available in O*NET for this classification.'
              : "Military occupation — task-level data is not collected by O*NET."}
          </div>
        )}
        {!r.category && r.total_employment && (
          <div style={{ fontSize: 12, color: t.inkMuted, marginTop: 2, fontFamily: TYPE.mono }}>
            {(r.total_employment / 1000).toFixed(0)}K workers nationally
          </div>
        )}
      </div>

      {/* Scores — coloured by SIGNAL (data source), never by exposure zone */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
        {r.eloundou_beta != null && <ScorePill label="Eloundou" value={r.eloundou_beta} color={SIGNAL_COLORS.eloundou} />}
        {r.ms_ai_applicability != null && <ScorePill label="Microsoft" value={r.ms_ai_applicability} color={SIGNAL_COLORS.microsoft} />}
        {r.aei_exposure != null && <ScorePill label="AEI" value={r.aei_exposure} color={SIGNAL_COLORS.aei} />}
        {r.dominant_zone && (
          <span
            title={ZONE_TITLES[r.dominant_zone as keyof typeof ZONE_TITLES]}
            style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16, fontFamily: TYPE.body,
              color: ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || t.inkMuted,
              backgroundColor: (ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || t.inkMuted) + "15",
              border: `1px solid ${(ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || t.inkMuted)}40`,
            }}
          >
            {ZONE_LABELS[r.dominant_zone as keyof typeof ZONE_LABELS] || r.dominant_zone}
          </span>
        )}
        {clickable && hovered && (
          <CurrentFlow direction="right" length={26} breadth={14} strokes={1} opacity={0.5} speed={2} />
        )}
      </div>
    </div>
  );
}

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: t.inkMuted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: TYPE.mono }}>{value.toFixed(2)}</div>
    </div>
  );
}
