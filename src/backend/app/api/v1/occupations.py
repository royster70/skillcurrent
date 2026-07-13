"""Occupation endpoints — hierarchical navigation and detail views."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    OccupationDetail,
    OccupationEraSnapshot,
    OccupationSectorProfile,
    OccupationSummary,
    OccupationTasksResponse,
    OccupationsResponse,
    SocHierarchyNode,
    SocHierarchyResponse,
    TaskWithDrift,
)
from app.db.session import get_db

router = APIRouter(prefix="/occupations", tags=["occupations"])

# SOC major group titles (derived from SOC 2018 structure)
_MAJOR_GROUPS = {
    "11": "Management",
    "13": "Business and Financial Operations",
    "15": "Computer and Mathematical",
    "17": "Architecture and Engineering",
    "19": "Life, Physical, and Social Science",
    "21": "Community and Social Service",
    "23": "Legal",
    "25": "Educational Instruction and Library",
    "27": "Arts, Design, Entertainment, Sports, and Media",
    "29": "Healthcare Practitioners and Technical",
    "31": "Healthcare Support",
    "33": "Protective Service",
    "35": "Food Preparation and Serving Related",
    "37": "Building and Grounds Cleaning and Maintenance",
    "39": "Personal Care and Service",
    "41": "Sales and Related",
    "43": "Office and Administrative Support",
    "45": "Farming, Fishing, and Forestry",
    "47": "Construction and Extraction",
    "49": "Installation, Maintenance, and Repair",
    "51": "Production",
    "53": "Transportation and Material Moving",
}


@router.get("/hierarchy", response_model=SocHierarchyResponse)
async def get_soc_hierarchy(
    db: AsyncSession = Depends(get_db),
) -> SocHierarchyResponse:
    """Get SOC occupation hierarchy with aggregate stats per group.

    Returns a tree: major group → occupations with Eloundou Beta and employment.
    """
    r = await db.execute(
        text(
            """
        SELECT
            o.onet_soc, o.title,
            SUBSTRING(o.onet_soc, 1, 2) AS major_code,
            e.dv_beta_derived,
            ow_total.total_emp
        FROM onet_occupations o
        LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
        LEFT JOIN (
            SELECT onet_soc, SUM(employment) AS total_emp
            FROM oews_employment WHERE employment IS NOT NULL
            GROUP BY onet_soc
        ) ow_total ON ow_total.onet_soc = SUBSTRING(o.onet_soc, 1, 7)
        WHERE EXISTS (
            SELECT 1 FROM onet_task_statements ts WHERE ts.onet_soc = o.onet_soc
        )
        ORDER BY o.onet_soc
    """
        )
    )

    # Build hierarchy
    major_groups: dict[str, SocHierarchyNode] = {}
    total_occupations = 0

    for row in r.fetchall():
        soc_code, title, major_code = row[0], row[1], row[2]
        beta, emp = row[3], row[4]
        total_occupations += 1

        if major_code not in major_groups:
            major_groups[major_code] = SocHierarchyNode(
                code=f"{major_code}-0000",
                title=_MAJOR_GROUPS.get(major_code, f"Group {major_code}"),
                level="major",
                children=[],
                occupation_count=0,
            )

        group = major_groups[major_code]
        group.children.append(
            SocHierarchyNode(
                code=soc_code,
                title=title,
                level="detailed",
                avg_eloundou_beta=round(beta, 4) if beta else None,
                total_employment=emp,
            )
        )
        group.occupation_count += 1

    # Compute group-level aggregates
    for group in major_groups.values():
        betas = [c.avg_eloundou_beta for c in group.children if c.avg_eloundou_beta is not None]
        emps = [c.total_employment for c in group.children if c.total_employment is not None]
        group.avg_eloundou_beta = round(sum(betas) / len(betas), 4) if betas else None
        group.total_employment = sum(emps) if emps else None

    hierarchy = sorted(major_groups.values(), key=lambda g: g.code)

    return SocHierarchyResponse(
        hierarchy=hierarchy,
        total_major_groups=len(hierarchy),
        total_occupations=total_occupations,
    )


@router.get("", response_model=OccupationsResponse)
async def list_occupations(
    sector: str | None = Query(None, description="NAICS sector code filter"),
    zone: str | None = Query(None, description="Exposure zone filter: E0, E1, E2"),
    classification: str | None = Query(None, description="Drift classification filter"),
    major_group: str | None = Query(None, description="SOC major group code (e.g., '15')"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> OccupationsResponse:
    """List occupations with filtering and pagination."""
    conditions = []
    params: dict[str, str | int] = {
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    base_query = """
        SELECT DISTINCT ON (p.onet_soc)
            p.onet_soc, p.occupation_title,
            SUBSTRING(p.onet_soc, 1, 2) || '-0000' AS major_group,
            p.headcount, p.eloundou_beta, p.ms_ai_applicability,
            p.aei_exposure, p.dominant_zone,
            p.drift_velocity, p.drift_classification
        FROM industry_occupation_profiles p
    """

    if sector:
        conditions.append("p.naics_code = :sector")
        params["sector"] = sector
    if zone:
        conditions.append("p.dominant_zone = :zone")
        params["zone"] = zone
    if classification:
        conditions.append("p.drift_classification = :classification")
        params["classification"] = classification
    if major_group:
        conditions.append("SUBSTRING(p.onet_soc, 1, 2) = :major_group")
        params["major_group"] = major_group

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Count total
    count_sql = f"SELECT COUNT(*) FROM ({base_query} {where}) t"
    count_r = await db.execute(text(count_sql), params)
    total = count_r.scalar() or 0

    # Fetch page
    data_sql = f"""
        {base_query} {where}
        ORDER BY p.onet_soc, p.headcount DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """
    r = await db.execute(text(data_sql), params)

    occupations = [
        OccupationSummary(
            soc_code=row[0],
            title=row[1] or row[0],
            major_group=row[2],
            major_group_title=_MAJOR_GROUPS.get(row[0][:2]),
            headcount=row[3],
            eloundou_beta=round(row[4], 4) if row[4] else None,
            ms_ai_applicability=round(row[5], 4) if row[5] else None,
            aei_exposure=round(row[6], 4) if row[6] else None,
            dominant_zone=row[7],
            drift_velocity=round(row[8], 6) if row[8] else None,
            drift_classification=row[9],
        )
        for row in r.fetchall()
    ]

    return OccupationsResponse(occupations=occupations, total=total, page=page, page_size=page_size)


@router.get("/{soc_code}", response_model=OccupationDetail)
async def get_occupation(
    soc_code: str,
    db: AsyncSession = Depends(get_db),
) -> OccupationDetail:
    """Get detailed view of a single occupation with three-tier scores."""
    # Try 8-digit first, then 6-digit prefix
    r = await db.execute(
        text(
            """
        SELECT o.onet_soc, o.title, o.description
        FROM onet_occupations o
        WHERE o.onet_soc = :soc_code OR o.onet_soc LIKE :soc_prefix || '%'
        ORDER BY o.onet_soc LIMIT 1
    """
        ),
        {"soc_code": soc_code, "soc_prefix": soc_code},
    )

    occ = r.fetchone()
    if not occ:
        raise HTTPException(status_code=404, detail=f"Occupation {soc_code} not found")

    onet_soc = occ[0]
    soc_6 = onet_soc[:7]

    # Eloundou scores
    r = await db.execute(
        text(
            """
        SELECT dv_beta_derived, human_beta_derived
        FROM eloundou_occ_scores WHERE onet_soc = :soc
    """
        ),
        {"soc": onet_soc},
    )
    eloundou = r.fetchone()

    # Microsoft score
    r = await db.execute(
        text(
            """
        SELECT ai_applicability_score
        FROM ms_ai_applicability_scores WHERE soc_code = :soc
    """
        ),
        {"soc": soc_6},
    )
    ms = r.fetchone()

    # AEI exposure
    r = await db.execute(
        text(
            """
        SELECT observed_exposure
        FROM aei_job_exposure WHERE occ_code = :soc
    """
        ),
        {"soc": soc_6},
    )
    aei = r.fetchone()

    # Employment by sector
    r = await db.execute(
        text(
            """
        SELECT naics_code, naics_title, headcount, employment_share
        FROM industry_occupation_profiles
        WHERE onet_soc = :soc AND headcount IS NOT NULL
        ORDER BY headcount DESC LIMIT 10
    """
        ),
        {"soc": soc_6},
    )
    sectors = [
        OccupationSectorProfile(
            naics_code=row[0],
            naics_title=row[1],
            headcount=row[2],
            employment_share=round(row[3], 4) if row[3] else None,
        )
        for row in r.fetchall()
    ]

    # Total employment
    total_emp = sum(s.headcount for s in sectors if s.headcount) if sectors else None

    # Zone from Eloundou Beta
    beta = eloundou[0] if eloundou else None
    zone = None
    if beta is not None:
        zone = "E2" if beta >= 0.85 else ("E1" if beta >= 0.40 else "E0")

    # Drift (aggregate from task_drift_metrics via AEI task matching)
    r = await db.execute(
        text(
            """
        SELECT AVG(velocity), MODE() WITHIN GROUP (ORDER BY classification)
        FROM task_drift_metrics tdm
        WHERE velocity IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM aei_task_snapshots ats
              WHERE ats.task_text = tdm.task_text
                AND ats.onet_soc_codes @> ARRAY[:soc]
          )
    """
        ),
        {"soc": soc_6},
    )
    drift_row = r.fetchone()

    # Percentile context for score cards (storytelling)
    r = await db.execute(
        text(
            """
        WITH e_ranked AS (
            SELECT onet_soc,
                   PERCENT_RANK() OVER (ORDER BY dv_beta_derived) AS pct,
                   COUNT(*) OVER () AS pop
            FROM eloundou_occ_scores WHERE dv_beta_derived IS NOT NULL
        ),
        e_med AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dv_beta_derived) AS median
            FROM eloundou_occ_scores WHERE dv_beta_derived IS NOT NULL
        ),
        m_ranked AS (
            SELECT soc_code,
                   PERCENT_RANK() OVER (ORDER BY ai_applicability_score) AS pct,
                   COUNT(*) OVER () AS pop
            FROM ms_ai_applicability_scores WHERE ai_applicability_score IS NOT NULL
        ),
        m_med AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ai_applicability_score) AS median
            FROM ms_ai_applicability_scores WHERE ai_applicability_score IS NOT NULL
        ),
        a_ranked AS (
            SELECT occ_code,
                   PERCENT_RANK() OVER (ORDER BY observed_exposure) AS pct,
                   COUNT(*) OVER () AS pop
            FROM aei_job_exposure WHERE observed_exposure IS NOT NULL
        ),
        a_med AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY observed_exposure) AS median
            FROM aei_job_exposure WHERE observed_exposure IS NOT NULL
        )
        SELECT
            e.pct, em.median, e.pop,
            m.pct, mm.median, m.pop,
            a.pct, am.median, a.pop
        FROM (SELECT 1) AS dummy
        LEFT JOIN e_ranked e ON e.onet_soc = :onet_soc
        LEFT JOIN m_ranked m ON m.soc_code = :soc_6
        LEFT JOIN a_ranked a ON a.occ_code = :soc_6
        CROSS JOIN e_med em
        CROSS JOIN m_med mm
        CROSS JOIN a_med am
        LIMIT 1
    """
        ),
        {"onet_soc": onet_soc, "soc_6": soc_6},
    )
    pct_row = r.fetchone()

    # AEI temporal trend — occupation-level aggregation across model eras
    r = await db.execute(
        text(
            """
        SELECT ats.model_era, AVG(ats.task_pct) AS avg_task_pct, COUNT(*) AS task_count
        FROM aei_task_snapshots ats
        WHERE ats.platform = 'claude_ai'
          AND ats.task_pct IS NOT NULL
          AND LOWER(ats.task_text) IN (
              SELECT LOWER(task) FROM onet_task_statements WHERE onet_soc = :onet_soc
          )
        GROUP BY ats.model_era, ats.snapshot_date
        ORDER BY ats.snapshot_date
    """
        ),
        {"onet_soc": onet_soc},
    )
    era_rows = r.fetchall()
    aei_era_snapshots = [
        OccupationEraSnapshot(
            model_era=row[0],
            avg_task_pct=round(row[1], 4),
            task_count=row[2],
        )
        for row in era_rows
    ]

    # GDPval benchmark availability
    r = await db.execute(
        text(
            """
        SELECT COUNT(*) FROM gdpval_tasks WHERE onet_soc = :soc
    """
        ),
        {"soc": onet_soc},
    )
    gdpval_count = r.scalar() or 0

    return OccupationDetail(
        soc_code=onet_soc,
        title=occ[1],
        description=occ[2],
        major_group=f"{onet_soc[:2]}-0000",
        minor_group=f"{onet_soc[:4]}000" if len(onet_soc) >= 4 else None,
        eloundou_beta_gpt4=round(eloundou[0], 4) if eloundou and eloundou[0] else None,
        eloundou_beta_human=round(eloundou[1], 4) if eloundou and eloundou[1] else None,
        ms_ai_applicability=round(ms[0], 4) if ms and ms[0] else None,
        aei_exposure=round(aei[0], 4) if aei and aei[0] else None,
        dominant_zone=zone,
        total_employment=total_emp,
        top_sectors=sectors,
        drift_velocity=round(drift_row[0], 6) if drift_row and drift_row[0] else None,
        drift_classification=drift_row[1] if drift_row else None,
        # Percentile context
        eloundou_percentile=round(pct_row[0] * 100) if pct_row and pct_row[0] is not None else None,
        ms_ai_percentile=round(pct_row[3] * 100) if pct_row and pct_row[3] is not None else None,
        aei_percentile=round(pct_row[6] * 100) if pct_row and pct_row[6] is not None else None,
        eloundou_median=round(pct_row[1], 4) if pct_row and pct_row[1] is not None else None,
        ms_ai_median=round(pct_row[4], 4) if pct_row and pct_row[4] is not None else None,
        aei_median=round(pct_row[7], 4) if pct_row and pct_row[7] is not None else None,
        eloundou_population=pct_row[2] if pct_row and pct_row[2] is not None else None,
        ms_ai_population=pct_row[5] if pct_row and pct_row[5] is not None else None,
        aei_population=pct_row[8] if pct_row and pct_row[8] is not None else None,
        aei_era_snapshots=aei_era_snapshots,
        gdpval_task_count=gdpval_count,
        gdpval_available=gdpval_count > 0,
    )


@router.get("/{soc_code}/tasks", response_model=OccupationTasksResponse)
async def get_occupation_tasks(
    soc_code: str,
    db: AsyncSession = Depends(get_db),
) -> OccupationTasksResponse:
    """Get tasks for an occupation with drift velocity and classification."""
    # Resolve SOC code
    r = await db.execute(
        text(
            """
        SELECT onet_soc, title FROM onet_occupations
        WHERE onet_soc = :soc OR onet_soc LIKE :prefix || '%'
        ORDER BY onet_soc LIMIT 1
    """
        ),
        {"soc": soc_code, "prefix": soc_code},
    )
    occ = r.fetchone()
    if not occ:
        raise HTTPException(status_code=404, detail=f"Occupation {soc_code} not found")

    onet_soc = occ[0]

    # Get tasks with drift data
    r = await db.execute(
        text(
            """
        SELECT ts.task, tdm.latest_task_pct, tdm.velocity,
               tdm.r_squared, tdm.classification, tdm.snapshot_count
        FROM onet_task_statements ts
        LEFT JOIN task_drift_metrics tdm ON LOWER(tdm.task_text) = LOWER(ts.task)
        WHERE ts.onet_soc = :soc
        ORDER BY COALESCE(tdm.latest_task_pct, 0) DESC
    """
        ),
        {"soc": onet_soc},
    )

    tasks = [
        TaskWithDrift(
            task_text=row[0],
            task_pct=round(row[1], 4) if row[1] else None,
            velocity=round(row[2], 6) if row[2] else None,
            r_squared=round(row[3], 3) if row[3] else None,
            classification=row[4],
            snapshot_count=row[5],
        )
        for row in r.fetchall()
    ]

    return OccupationTasksResponse(
        soc_code=onet_soc, title=occ[1], tasks=tasks, total_tasks=len(tasks)
    )
