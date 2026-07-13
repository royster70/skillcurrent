"""Build ANZSCO → O*NET SOC concordance via semantic matching.

Reads ANZSCO occupation titles (principal + alternative + specialisation)
from ABS Excel files, embeds them using the same all-MiniLM-L6-v2 model
used for O*NET title embeddings, and finds the best O*NET SOC match for
each ANZSCO unit group via pgvector cosine similarity.

Usage:
    python -m scripts.build_anzsco_concordance

Data files expected:
    C:/Users/royst/Projects/Data/ANZSCO/anzsco 2022 structure 062023.xlsx
    C:/Users/royst/Projects/Data/ANZSCO/anzsco 2022 index of principal titles, alternative titles and specialisations 062023.xlsx
"""

import asyncio
import logging
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402
from app.services.embedding_service import MODEL_NAME  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(settings.anzsco_data_path)
STRUCTURE_FILE = DATA_DIR / "anzsco 2022 structure 062023.xlsx"
TITLES_FILE = (
    DATA_DIR
    / "anzsco 2022 index of principal titles, alternative titles and specialisations 062023.xlsx"
)

# Confidence thresholds
AUTO_ACCEPT = 0.85
NEEDS_REVIEW = 0.70


def load_anzsco_titles() -> dict[str, list[str]]:
    """Load all ANZSCO title variants grouped by 4-digit unit group code.

    Returns: {anzsco_4digit: [title1, title2, ...]}
    """
    titles_by_code: dict[str, list[str]] = defaultdict(list)

    # 1. Structure file Table 6 — canonical 6-digit codes and titles
    logger.info("Reading ANZSCO structure (Table 6)...")
    df = pd.read_excel(STRUCTURE_FILE, sheet_name="Table 6", header=None, skiprows=5)
    df.columns = ["code", "title"]
    # Filter out header row and non-numeric codes
    df = df[df["code"].apply(lambda x: str(x).replace(".", "").isdigit() if pd.notna(x) else False)]
    df["code"] = df["code"].astype(int).astype(str)

    for _, row in df.iterrows():
        code_4 = row["code"][:4]
        titles_by_code[code_4].append(str(row["title"]).strip())

    logger.info("  %d 6-digit occupations → %d unit groups", len(df), len(titles_by_code))

    # 2. Titles index — alternative titles and specialisations
    logger.info("Reading ANZSCO titles index (Table 1)...")
    df2 = pd.read_excel(TITLES_FILE, sheet_name="Table 1", header=None, skiprows=5)
    df2.columns = ["code", "description", "category"]
    # Filter out header row and non-numeric codes
    df2 = df2[
        df2["code"].apply(lambda x: str(x).replace(".", "").isdigit() if pd.notna(x) else False)
    ]
    df2["code"] = df2["code"].astype(int).astype(str)

    alt_count = 0
    for _, row in df2.iterrows():
        code_4 = str(row["code"])[:4]
        title = str(row["description"]).strip()
        if title and code_4 in titles_by_code:
            titles_by_code[code_4].append(title)
            alt_count += 1

    logger.info("  %d alternative/specialisation titles added", alt_count)

    total_titles = sum(len(v) for v in titles_by_code.values())
    logger.info("Total: %d unit groups, %d title variants", len(titles_by_code), total_titles)

    return dict(titles_by_code)


async def match_anzsco_to_onet(
    session: AsyncSession,
    model: SentenceTransformer,
    anzsco_code: str,
    title_variants: list[str],
) -> dict | None:
    """Find best O*NET SOC match for an ANZSCO unit group.

    Embeds all title variants and queries pgvector for each.
    Returns the highest-confidence match across all variants.
    """
    best_match: dict | None = None
    best_similarity = 0.0

    # Batch encode all variants
    embeddings = model.encode(title_variants, show_progress_bar=False)

    for title, embedding in zip(title_variants, embeddings):
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        r = await session.execute(
            text(
                """
            SELECT te.onet_soc, o.title,
                   1 - (te.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM onet_title_embeddings te
            JOIN onet_occupations o ON o.onet_soc = te.onet_soc
            WHERE te.embedding IS NOT NULL
            ORDER BY te.embedding <=> CAST(:embedding AS vector)
            LIMIT 1
        """
            ),
            {"embedding": embedding_str},
        )

        row = r.fetchone()
        if row and float(row[2]) > best_similarity:
            best_similarity = float(row[2])
            best_match = {
                "onet_soc": row[0],
                "onet_title": row[1],
                "similarity": round(best_similarity, 4),
                "matched_variant": title,
            }

    return best_match


async def run() -> int:
    """Build the ANZSCO→SOC concordance via semantic matching. Returns rows inserted.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    # Load ANZSCO titles
    titles_by_code = load_anzsco_titles()

    # Load model
    logger.info("Loading sentence-transformers model: %s", MODEL_NAME)
    model = SentenceTransformer(MODEL_NAME)

    # Connect to database
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Clear existing concordance
        await session.execute(text("DELETE FROM anzsco_soc_concordance"))
        await session.flush()

        # Get principal title for each 4-digit code (first title in structure file)
        principal_titles: dict[str, str] = {}
        df = pd.read_excel(STRUCTURE_FILE, sheet_name="Table 6", header=None, skiprows=5)
        df.columns = ["code", "title"]
        df = df[
            df["code"].apply(lambda x: str(x).replace(".", "").isdigit() if pd.notna(x) else False)
        ]
        df["code"] = df["code"].astype(int).astype(str)
        for _, row in df.iterrows():
            code_4 = row["code"][:4]
            if code_4 not in principal_titles:
                principal_titles[code_4] = str(row["title"]).strip()

        # Match each ANZSCO unit group
        total = len(titles_by_code)
        matched = 0
        auto_accepted = 0
        needs_review = 0
        low_confidence = 0
        inserted = 0

        for i, (anzsco_code, variants) in enumerate(sorted(titles_by_code.items()), 1):
            match = await match_anzsco_to_onet(session, model, anzsco_code, variants)

            if match:
                matched += 1
                confidence = match["similarity"]
                reviewed = confidence >= AUTO_ACCEPT
                if reviewed:
                    auto_accepted += 1
                elif confidence >= NEEDS_REVIEW:
                    needs_review += 1
                else:
                    low_confidence += 1

                await session.execute(
                    text(
                        """
                    INSERT INTO anzsco_soc_concordance
                        (anzsco_code, anzsco_title, onet_soc, onet_title,
                         match_method, confidence, matched_variant, reviewed)
                    VALUES
                        (:anzsco_code, :anzsco_title, :onet_soc, :onet_title,
                         'semantic', :confidence, :matched_variant, :reviewed)
                    ON CONFLICT (anzsco_code, onet_soc) DO UPDATE SET
                        confidence = EXCLUDED.confidence,
                        matched_variant = EXCLUDED.matched_variant,
                        reviewed = EXCLUDED.reviewed
                """
                    ),
                    {
                        "anzsco_code": anzsco_code,
                        "anzsco_title": principal_titles.get(anzsco_code, variants[0]),
                        "onet_soc": match["onet_soc"],
                        "onet_title": match["onet_title"],
                        "confidence": confidence,
                        "matched_variant": match["matched_variant"],
                        "reviewed": reviewed,
                    },
                )
                inserted += 1

            if i % 50 == 0:
                logger.info("  %d / %d processed...", i, total)

        await session.commit()

        logger.info("")
        logger.info("=== ANZSCO → SOC Concordance Results ===")
        logger.info("Total ANZSCO unit groups: %d", total)
        logger.info("Matched: %d (%.1f%%)", matched, matched / total * 100)
        logger.info("  Auto-accepted (≥%.2f): %d", AUTO_ACCEPT, auto_accepted)
        logger.info("  Needs review (%.2f–%.2f): %d", NEEDS_REVIEW, AUTO_ACCEPT, needs_review)
        logger.info("  Low confidence (<%.2f): %d", NEEDS_REVIEW, low_confidence)
        logger.info("Inserted: %d rows", inserted)

        # Show some low-confidence matches for review
        r = await session.execute(
            text(
                """
            SELECT anzsco_code, anzsco_title, onet_soc, onet_title, confidence, matched_variant
            FROM anzsco_soc_concordance
            WHERE confidence < :threshold
            ORDER BY confidence ASC
            LIMIT 20
        """
            ),
            {"threshold": NEEDS_REVIEW},
        )

        low_matches = r.fetchall()
        if low_matches:
            logger.info("")
            logger.info("Lowest confidence matches (need manual review):")
            for row in low_matches:
                logger.info(
                    "  ANZSCO %s (%s) → SOC %s (%s) [%.3f via '%s']",
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                )

    await engine.dispose()
    return inserted


async def main() -> None:
    await run()


if __name__ == "__main__":
    asyncio.run(main())
