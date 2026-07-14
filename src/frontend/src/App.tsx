import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { SourcesPage } from "./pages/SourcesPage";
import { SectorsPage } from "./pages/SectorsPage";
import { SectorDetailPage } from "./pages/SectorDetailPage";
import { CompositeSectorPage } from "./pages/CompositeSectorPage";
import { OccupationsPage } from "./pages/OccupationsPage";
import { DriftPage } from "./pages/DriftPage";
import { SearchPage } from "./pages/SearchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/sectors" element={<SectorsPage />} />
          <Route path="/sectors/composite" element={<CompositeSectorPage />} />
          <Route path="/sectors/:code" element={<SectorDetailPage />} />
          <Route path="/occupations" element={<OccupationsPage />} />
          <Route path="/drift" element={<DriftPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
