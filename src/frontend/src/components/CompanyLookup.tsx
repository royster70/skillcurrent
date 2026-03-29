/**
 * CompanyLookup — search ASX-listed companies or classify any company
 * via AI to auto-select industry sectors for composite analysis.
 *
 * Layer 1: Instant search against ~2,000 ASX-listed companies
 * Layer 2: LLM classification for unlisted/SME companies (with caching)
 *
 * Feeds selected sector codes into the parent's SectorChipSelector.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SubdivisionEntry, type OccupationMixEntry } from "../lib/api";
import { WorkforceProfileCards } from "./WorkforceProfileCards";

interface CompanyResult {
  company_name: string;
  asx_code: string | null;
  sector_codes: string[];
  sector_names: string[];
  source: string;
  confidence: number | null;
  single_sector_asx?: boolean;
}

interface Props {
  region: string;
  onSectorsSelected: (codes: string[]) => void;
}

export function CompanyLookup({ region, onSectorsSelected }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<{
    name: string;
    codes: string[];
    names: string[];
    confidence: number | null;
    matched_subdivisions?: Record<string, SubdivisionEntry[]> | null;
    workforce_profile?: OccupationMixEntry[] | null;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounced search
  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const resp = await api.companySearch(q, region);
        setResults(resp.results);
      } catch {
        setError("Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [region],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(query), 300);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Reset on region change
  useEffect(() => {
    setQuery("");
    setResults([]);
    setClassifyResult(null);
    setError(null);
  }, [region]);

  const handleSelect = (result: CompanyResult) => {
    if (result.sector_codes.length === 1) {
      // Single sector — navigate directly to sector detail
      const code = result.sector_codes[0];
      navigate(`/sectors/${code}${region === "AU" ? "?region=AU" : ""}`);
    } else {
      // Multi-sector — populate chip selector for composite view
      onSectorsSelected(result.sector_codes);
    }
    setQuery("");
    setResults([]);
    setClassifyResult(null);
  };

  const handleClassify = async () => {
    if (!query.trim()) return;
    setClassifying(true);
    setError(null);
    try {
      const resp = await api.companyClassify(query.trim(), region);
      setClassifyResult({
        name: resp.company_name,
        codes: resp.sector_codes,
        names: resp.sectors.map((s) => s.name),
        confidence: resp.sectors[0]?.confidence ?? null,
        matched_subdivisions: resp.matched_subdivisions,
        workforce_profile: resp.workforce_profile,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Classification failed";
      setError(msg);
    } finally {
      setClassifying(false);
    }
  };

  const handleUseClassification = () => {
    if (classifyResult) {
      if (classifyResult.codes.length === 1) {
        // Single sector — navigate directly
        const code = classifyResult.codes[0];
        navigate(`/sectors/${code}${region === "AU" ? "?region=AU" : ""}`);
      } else {
        // Multi-sector — populate chip selector
        onSectorsSelected(classifyResult.codes);
      }
      setQuery("");
      setResults([]);
      setClassifyResult(null);
    }
  };

  const regionLabel = region === "AU" ? "ANZSIC" : "NAICS";

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1.5px dashed #CBD5E1",
        background: "#F8FAFC",
        overflow: "hidden",
        transition: "all 0.3s ease",
      }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#475569"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3" />
            <path d="M5 21V10.9M19 21V10.9M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
          </svg>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            Look up a company
          </span>
          <span
            style={{
              fontSize: 12,
              color: "#94A3B8",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {region === "AU"
              ? "Search ASX listings or classify with AI"
              : "Classify with AI"}
          </span>
        </div>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94A3B8"
          strokeWidth={2}
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Body — collapsible */}
      {expanded && (
        <div style={{ padding: "0 20px 16px", borderTop: "1px solid #E2E8F0" }}>
          {/* Search input */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                region === "AU"
                  ? "Type company name (e.g. Telstra, Jemena, Woolworths)..."
                  : "Type company name (e.g. Microsoft, JPMorgan)..."
              }
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #CBD5E1",
                fontSize: 13,
                fontFamily: "Inter, system-ui, sans-serif",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2563EB")}
              onBlur={(e) => (e.target.style.borderColor = "#CBD5E1")}
            />
            {query.length >= 2 && results.length === 0 && !searching && (
              <button
                onClick={handleClassify}
                disabled={classifying}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: classifying ? "#94A3B8" : "#7C3AED",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: classifying ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                {classifying ? "Classifying..." : "Classify with AI"}
              </button>
            )}
          </div>

          {/* Loading indicator */}
          {searching && (
            <div
              style={{
                fontSize: 12,
                color: "#94A3B8",
                marginTop: 8,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              Searching...
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                fontSize: 12,
                color: "#DC2626",
                marginTop: 8,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {error}
            </div>
          )}

          {/* ASX / cached results */}
          {results.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {results.slice(0, 8).map((r, i) => (
                <div
                  key={i}
                  onClick={() => handleSelect(r)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "#fff",
                    border: "1px solid #E4E4E7",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F0F4FF")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "Inter, system-ui, sans-serif",
                      }}
                    >
                      {r.company_name}
                    </span>
                    {r.asx_code && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#6366F1",
                          background: "#EEF2FF",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontFamily: "Inter, system-ui, sans-serif",
                        }}
                      >
                        {r.asx_code}
                      </span>
                    )}
                    {r.source === "cached" && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#7C3AED",
                          background: "#F5F3FF",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontFamily: "Inter, system-ui, sans-serif",
                        }}
                      >
                        AI
                      </span>
                    )}
                    {r.single_sector_asx && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "#7C3AED",
                          fontFamily: "Inter, system-ui, sans-serif",
                          opacity: 0.7,
                        }}
                        title="AI can identify additional sectors for this company"
                      >
                        AI can refine &rarr;
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {r.sector_codes.map((code) => (
                      <span
                        key={code}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#475569",
                          background: "#F1F5F9",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontFamily: "Inter, system-ui, sans-serif",
                        }}
                      >
                        {regionLabel} {code}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {results.length === 0 && query.length >= 2 && !searching && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#94A3B8",
                    padding: 8,
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                >
                  No matches found.{" "}
                  <button
                    onClick={handleClassify}
                    disabled={classifying}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#7C3AED",
                      cursor: "pointer",
                      fontSize: 12,
                      textDecoration: "underline",
                      padding: 0,
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    Classify with AI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* LLM classification result */}
          {classifyResult && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: "#F5F3FF",
                border: "1.5px solid #DDD6FE",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#5B21B6",
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    AI Classification
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#7C3AED",
                      marginLeft: 8,
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    {classifyResult.name}
                  </span>
                  {classifyResult.confidence && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#6D28D9",
                        background: "#EDE9FE",
                        padding: "1px 6px",
                        borderRadius: 4,
                        marginLeft: 8,
                        fontFamily: "Inter, system-ui, sans-serif",
                      }}
                    >
                      {Math.round(classifyResult.confidence * 100)}% confident
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                {classifyResult.names.map((name, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      color: "#5B21B6",
                      background: "#EDE9FE",
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    {classifyResult.codes[i]}: {name}
                  </span>
                ))}
              </div>
              {/* Subdivision breadcrumbs — L2 detail under each sector */}
              {classifyResult.matched_subdivisions && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {classifyResult.codes.map((code) => {
                    const subs = classifyResult.matched_subdivisions?.[code];
                    if (!subs || subs.length === 0) return null;
                    return (
                      <div key={code} style={{ paddingLeft: 12 }}>
                        <span style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, fontFamily: "Inter, system-ui, sans-serif" }}>
                          {code}:
                        </span>
                        {subs.slice(0, 3).map((sub) => (
                          <span
                            key={sub.subdivision_name}
                            style={{
                              fontSize: 10, color: "#6D28D9", background: "#F5F3FF",
                              padding: "1px 6px", borderRadius: 3, marginLeft: 4,
                              fontFamily: "Inter, system-ui, sans-serif",
                            }}
                          >
                            {sub.subdivision_name}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Workforce profile cards */}
              {classifyResult.workforce_profile && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#6D28D9", marginBottom: 6, fontWeight: 500, fontFamily: "Inter, system-ui, sans-serif" }}>
                    Workforce Composition (Census 2021)
                  </div>
                  <WorkforceProfileCards profile={classifyResult.workforce_profile} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={handleUseClassification}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: "#7C3AED",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                >
                  {classifyResult.codes.length === 1
                    ? `View ${classifyResult.names[0].split(",")[0]} sector →`
                    : "Use these sectors"}
                </button>
                <button
                  onClick={() => setClassifyResult(null)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid #DDD6FE",
                    background: "#fff",
                    color: "#6D28D9",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Hint when no query */}
          {query.length === 0 && !classifyResult && (
            <div
              style={{
                fontSize: 12,
                color: "#94A3B8",
                marginTop: 8,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {region === "AU"
                ? "Search ~2,000 ASX-listed companies instantly, or classify any company with AI."
                : "Type a company name and use AI classification to identify its industry sectors."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
