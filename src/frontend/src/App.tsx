import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./lib/language";
import { AudienceProvider } from "./lib/audience";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { SourcesPage } from "./pages/SourcesPage";
import { RunPage } from "./pages/RunPage";
import { SectorsPage } from "./pages/SectorsPage";
import { SectorDetailPage } from "./pages/SectorDetailPage";
import { CompositeSectorPage } from "./pages/CompositeSectorPage";
import { OccupationsPage } from "./pages/OccupationsPage";
import { TidePage } from "./pages/TidePage";
import { SearchPage } from "./pages/SearchPage";
import { OccupationBriefPage, SectorBriefPage } from "./pages/BriefPage";

function App() {
  return (
    // basename so routes resolve when the site is served under a sub-path
    // (GitHub Pages: /<repo>/). BASE_URL is "/" for dev/Docker, "/skillcurrent/"
    // for the cdn build (set by vite `base`).
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {/* Language mode (plain | nautical, #79) + audience mode (individual |
          organisation | education, #86) wrap the tree inside the router so
          toggles re-render nav/copy and disclosure deep links can use <Link>.
          The two are orthogonal — vocabulary register vs. framing. */}
      <LanguageProvider>
      <AudienceProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/sectors" element={<SectorsPage />} />
          <Route path="/sectors/composite" element={<CompositeSectorPage />} />
          <Route path="/sectors/:code" element={<SectorDetailPage />} />
          <Route path="/occupations" element={<OccupationsPage />} />
          <Route path="/tide" element={<TidePage />} />
          {/* Old name — keep deep links working */}
          <Route path="/drift" element={<Navigate to="/tide" replace />} />
        </Route>
        {/* One-page briefs (#85) — OUTSIDE <Layout> so no sidebar/chrome prints. */}
        <Route path="/brief/occupation/:soc" element={<OccupationBriefPage />} />
        <Route path="/brief/sector/:code" element={<SectorBriefPage />} />
      </Routes>
      </AudienceProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
