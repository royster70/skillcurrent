import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { SectorsPage } from "./pages/SectorsPage";
import { SectorDetailPage } from "./pages/SectorDetailPage";
import { OccupationsPage } from "./pages/OccupationsPage";
import { DriftPage } from "./pages/DriftPage";
import { SearchPage } from "./pages/SearchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SectorsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/sectors/:code" element={<SectorDetailPage />} />
          <Route path="/occupations" element={<OccupationsPage />} />
          <Route path="/drift" element={<DriftPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
