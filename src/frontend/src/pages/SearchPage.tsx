import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SearchResult } from "../lib/api";
import { ZONE_COLORS, ZONE_LABELS } from "../lib/constants";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (query.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search(query);
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Role Search</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          Search 65,496 job titles to find AI exposure analysis for any role
        </p>
      </div>

      {/* Search input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by job title... e.g. 'software developer', 'nurse', 'accountant'"
          style={{
            flex: 1, padding: "12px 16px", fontSize: 16, borderRadius: 12,
            border: "1.5px solid #E4E4E7", outline: "none",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        />
        <button
          onClick={handleSearch}
          disabled={query.length < 2 || loading}
          style={{
            padding: "12px 24px", fontSize: 14, fontWeight: 600, borderRadius: 12,
            border: "none", backgroundColor: "#2563EB", color: "#fff", cursor: "pointer",
            opacity: query.length < 2 ? 0.5 : 1,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div style={{ padding: 32, textAlign: "center", color: "#71717A", fontSize: 15 }}>
          No occupations found for "{query}". Try a different job title.
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#71717A", marginBottom: 4 }}>
            {results.length} occupation{results.length !== 1 ? "s" : ""} matching "{query}"
          </div>

          {results.map((r) => (
            <div
              key={r.soc_code}
              onClick={() => navigate(`/occupations?selected=${r.soc_code}`)}
              style={{
                background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7",
                padding: 16, cursor: "pointer", display: "flex", justifyContent: "space-between",
                alignItems: "center", transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2563EB")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E4E4E7")}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{r.occupation_title}</div>
                <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>
                  {r.soc_code} · Matched: "{r.matched_title}"
                  {r.similarity != null && r.similarity < 1.0 && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4,
                      backgroundColor: r.similarity > 0.5 ? "#F0FDF4" : "#FFF7ED",
                      color: r.similarity > 0.5 ? "#16A34A" : "#F97316",
                    }}>
                      {Math.round(r.similarity * 100)}% match
                    </span>
                  )}
                </div>
                {r.total_employment && (
                  <div style={{ fontSize: 12, color: "#A1A1AA", marginTop: 2 }}>
                    {(r.total_employment / 1000).toFixed(0)}K workers nationally
                  </div>
                )}
              </div>

              {/* Scores */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                {r.eloundou_beta != null && (
                  <ScorePill label="Eloundou" value={r.eloundou_beta} color={ZONE_COLORS.E0} />
                )}
                {r.ms_ai_applicability != null && (
                  <ScorePill label="Microsoft" value={r.ms_ai_applicability} color={ZONE_COLORS.E1} />
                )}
                {r.aei_exposure != null && (
                  <ScorePill label="AEI" value={r.aei_exposure} color={ZONE_COLORS.E2} />
                )}
                {r.dominant_zone && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16,
                    color: ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || "#71717A",
                    backgroundColor: (ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || "#71717A") + "15",
                    border: `1px solid ${(ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] || "#71717A")}40`,
                  }}>
                    {ZONE_LABELS[r.dominant_zone as keyof typeof ZONE_LABELS] || r.dominant_zone}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick suggestions */}
      {!searched && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#71717A", fontWeight: 600 }}>Try searching for:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["software developer", "nurse", "accountant", "data analyst", "teacher", "lawyer", "project manager", "sales representative"].map((term) => (
              <button
                key={term}
                onClick={() => { setQuery(term); }}
                style={{
                  padding: "6px 14px", fontSize: 13, borderRadius: 20,
                  border: "1px solid #E4E4E7", backgroundColor: "#fff", cursor: "pointer",
                  fontFamily: "Inter, system-ui, sans-serif", color: "#71717A",
                }}
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

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#A1A1AA", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value.toFixed(2)}</div>
    </div>
  );
}
