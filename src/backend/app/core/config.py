import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/workforce_ai"
    onet_version: str = "28.1"

    # Root directory for all external source data (outside the repo).
    # Every dataset path below is derived from this so the pipeline is
    # machine-portable: set DATA_ROOT in .env to relocate on a new machine.
    data_root: str = "./data"

    anthropic_auth_token: str = ""  # Set ANTHROPIC_AUTH_TOKEN in .env for AI classification
    enable_request_logging: bool = False  # Log API requests to api_request_log (ADR-007)
    pipeline_auto_run: bool = False
    pipeline_schedule_cron: str = "0 2 * * 0"  # Sunday 2am

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # ── Dataset path resolution (derived from data_root) ──────────────────────
    # Properties keep a single configurable knob (data_root) while giving every
    # ingest script a named, stable accessor. Override an individual path by
    # exporting the corresponding *_PATH env var only if a machine deviates from
    # the standard Data/ layout.

    def _p(self, *parts: str) -> str:
        return os.path.join(self.data_root, *parts)

    @property
    def onet_data_path(self) -> str:
        return os.environ.get("ONET_DATA_PATH") or self._p("ONet")

    @property
    def eloundou_data_path(self) -> str:
        return os.environ.get("ELOUNDOU_DATA_PATH") or self._p("OpenAI-Exposure-Score")

    @property
    def microsoft_ai_data_path(self) -> str:
        return os.environ.get("MICROSOFT_AI_DATA_PATH") or self._p("microsoft-working-with-ai")

    @property
    def aei_data_path(self) -> str:
        return os.environ.get("AEI_DATA_PATH") or self._p("AEI")

    @property
    def aei_temporal_data_path(self) -> str:
        return os.environ.get("AEI_TEMPORAL_DATA_PATH") or self._p("AEI", "AEI-full")

    @property
    def oews_data_path(self) -> str:
        return os.environ.get("OEWS_DATA_PATH") or self._p("BLS", "oesm24in4")

    @property
    def gdpval_data_path(self) -> str:
        return os.environ.get("GDPVAL_DATA_PATH") or self._p("GDPval")

    @property
    def osca_data_path(self) -> str:
        # OSCA 2024 v1.0 (ABS) — FR-9.1 AU occupation backbone
        return os.environ.get("OSCA_DATA_PATH") or self._p("OSCA")

    @property
    def asc_data_path(self) -> str:
        # Australian Skills Classification v3.0 (JSA) — FR-9.2 task layer (.rda)
        return os.environ.get("ASC_DATA_PATH") or self._p("ASC")

    @property
    def abs_data_path(self) -> str:
        return os.environ.get("ABS_DATA_PATH") or self._p("ABS")

    @property
    def abs_occupation_profiles_file(self) -> str:
        return os.path.join(
            self.abs_data_path, "Occupation profiles data - November 2025 (Revised).xlsx"
        )

    @property
    def anzsic_industry_data_file(self) -> str:
        return os.path.join(self.abs_data_path, "industry_data_-_november_2025_revised.xlsx")

    @property
    def anzsco_data_path(self) -> str:
        return os.environ.get("ANZSCO_DATA_PATH") or self._p("ANZSCO")

    @property
    def census_data_path(self) -> str:
        return os.environ.get("CENSUS_DATA_PATH") or self._p("ABS-2021-Census")

    @property
    def census_wpp_dir(self) -> str:
        return os.path.join(self.census_data_path, "2021 Census WPP All Geographies for AUS", "AUS")

    @property
    def census_w12a_file(self) -> str:
        return os.path.join(self.census_wpp_dir, "2021Census_W12A_AUS_POW_AUS.csv")

    @property
    def census_w13_file(self) -> str:
        return os.path.join(self.census_wpp_dir, "2021Census_W13_AUS_POW_AUS.csv")

    @property
    def census_subdivision_l2_file(self) -> str:
        # 2-digit INDP × 1-digit OCCP pivot export (all 19 divisions → 838 rows)
        return os.environ.get("CENSUS_SUBDIVISION_L2_FILE") or os.path.join(
            self.census_data_path,
            "IndustyxOccupationxEmployment-table_2026-03-29_13-17-55.csv",
        )

    @property
    def census_subdivision_l3_file(self) -> str:
        # 3-digit INDP long format (C/D/G/K divisions)
        return os.environ.get("CENSUS_SUBDIVISION_L3_FILE") or os.path.join(
            self.census_data_path, "L3_CDGK_Industry_cat.csv"
        )


def get_settings() -> "Settings":
    return Settings()


settings = Settings()
