---
meta:
  name: testing
  description: "Comprehensive testing strategy for SkillCurrent"
---

You specialize in testing strategies for the SkillCurrent, covering unit tests, integration tests, E2E tests, and performance validation.

## Testing Pyramid
```
         E2E (5%)
        /        \
   Integration (15%)
    /              \
  Unit Tests (80%)
```

## Test Coverage Requirements

```bash
# Minimum coverage targets (PRD Section 9)
Backend (pytest-cov):
- Overall: 80%
- Services: 90%
- API endpoints: 85%
- Models: 70%
- Critical paths (matching, privacy): 95%

Frontend (vitest):
- Overall: 70%
- Components: 75%
- Hooks: 80%
- Utils: 85%

# Run coverage
pytest --cov=src/backend --cov-report=html --cov-report=term --cov-fail-under=80
npm run test:coverage -- --coverage.all --coverage.thresholds.lines=70
```

## Unit Testing Standards

### Test Structure (AAA Pattern)
```python
def test_build_hierarchy_simple():
    # Arrange: Set up test data
    employees = [
        {"employee_id": "E1", "manager_id": None},
        {"employee_id": "E2", "manager_id": "E1"}
    ]

    # Act: Execute function
    result = build_org_hierarchy(db, employees)

    # Assert: Verify results
    assert result['hierarchy']['E2']['hierarchy_path'] == ['E1', 'E2']
    assert result['hierarchy']['E2']['is_leaf_node'] == True
    assert result['hierarchy']['E1']['is_leaf_node'] == False
```

### Test Naming Convention
```python
# Pattern: test_<function>_<scenario>_<expected_result>

def test_build_hierarchy_with_cycle_raises_error():
    """FR-1.5: Detect circular reporting structures"""
    pass

def test_match_title_with_exact_match_returns_high_confidence():
    """FR-2.1: Layer 1 dictionary lookup"""
    pass

def test_score_exposure_with_missing_dwa_uses_llm_fallback():
    """FR-4.2: LLM fallback when OpenAI data unavailable"""
    pass

def test_privacy_view_anonymizes_leaf_nodes():
    """RA-5.3: Leaf node anonymization"""
    pass
```

### Fixtures (pytest)
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd

@pytest.fixture(scope="function")
def db_session():
    """Fresh database for each test"""
    engine = create_engine("postgresql://test:test@localhost/workforce_ai_test")
    Session = sessionmaker(bind=engine)
    session = Session()

    # Clean database
    session.execute("TRUNCATE employees, onet_matches, audit_logs CASCADE")
    session.commit()

    yield session

    session.close()

@pytest.fixture(scope="module")
def sample_employees():
    """Reusable test data for hierarchy tests"""
    return [
        {"employee_id": "CEO", "job_title": "Chief Executive Officer", "manager_id": None},
        {"employee_id": "VP1", "job_title": "VP Engineering", "manager_id": "CEO"},
        {"employee_id": "VP2", "job_title": "VP Finance", "manager_id": "CEO"},
        {"employee_id": "DIR1", "job_title": "Director Engineering", "manager_id": "VP1"},
        {"employee_id": "MGR1", "job_title": "Engineering Manager", "manager_id": "DIR1"},
        {"employee_id": "IC1", "job_title": "Software Engineer", "manager_id": "MGR1"},
        {"employee_id": "IC2", "job_title": "Software Engineer", "manager_id": "MGR1"},
    ]

@pytest.fixture(scope="module")
def onet_sample_data():
    """O*NET database sample for matching tests"""
    return {
        "occupations": pd.DataFrame([
            {"onet_soc": "15-1252.00", "title": "Software Developers"},
            {"onet_soc": "15-2051.00", "title": "Data Scientists"},
            {"onet_soc": "11-2021.00", "title": "Marketing Managers"},
        ]),
        "sample_titles": pd.DataFrame([
            {"onet_soc": "15-1252.00", "reported_title": "Software Engineer"},
            {"onet_soc": "15-1252.00", "reported_title": "Software Developer"},
            {"onet_soc": "15-2051.00", "reported_title": "Data Scientist"},
        ]),
        "activities": pd.DataFrame([
            {"onet_soc": "15-1252.00", "dwa_code": "4.A.2.a.4", "activity": "Analyze user needs"},
            {"onet_soc": "15-1252.00", "dwa_code": "4.A.2.b.2", "activity": "Write computer code"},
        ])
    }

@pytest.fixture(scope="module")
def openai_exposure_data():
    """OpenAI exposure scores sample"""
    return pd.DataFrame([
        {"dwa_code": "4.A.2.a.4", "E0": 0.72, "E1": 0.65, "E2": 0.58},
        {"dwa_code": "4.A.2.b.2", "E0": 0.85, "E1": 0.78, "E2": 0.70},
    ])

@pytest.fixture
def auth_headers():
    """Authentication headers for API tests"""
    def _make_headers(role: str = "admin", employee_id: str = "TEST_USER"):
        token = create_access_token({"sub": employee_id, "role": role})
        return {"Authorization": f"Bearer {token}"}
    return _make_headers
```

### Parametrized Tests
```python
@pytest.mark.parametrize("title,expected_onet,expected_layer", [
    ("Software Engineer", "15-1252.00", "layer_1"),  # Exact match
    ("Software Developer", "15-1252.00", "layer_1"),  # Dictionary
    ("Tech Lead - Engineering", "15-1252.00", "layer_2"),  # Contextual
    ("Code Architect", "15-1252.00", "layer_3"),  # Embeddings
    ("Data Scientist", "15-2051.00", "layer_1"),
    ("Product Manager", "11-2021.00", "layer_1"),
])
def test_match_common_titles(title, expected_onet, expected_layer, onet_sample_data):
    """FR-2: Test matching across multiple layers"""
    result = match_title_to_onet(title, onet_data=onet_sample_data)
    assert result.onet_soc == expected_onet
    assert result.matching_layer == expected_layer
    assert result.confidence >= 0.7

@pytest.mark.parametrize("exposure,expected_zone,expected_color", [
    (0.92, "E2", "green"),   # 85-100% = Automated
    (0.85, "E2", "green"),
    (0.75, "E1", "blue"),    # 40-84% = Augmented
    (0.50, "E1", "blue"),
    (0.35, "E0", "orange"),  # 0-39% = Insulated
    (0.10, "E0", "orange"),
])
def test_exposure_zone_classification(exposure, expected_zone, expected_color):
    """FR-4: Map exposure scores to automation zones"""
    result = classify_automation_zone(exposure)
    assert result.zone == expected_zone
    assert result.color == expected_color
```

## Platform-Specific Unit Tests

### 1. Hierarchy Build Tests (FR-1.3, FR-1.4)

```python
def test_hierarchy_simple_tree(db_session, sample_employees):
    """FR-1.3: Build basic organizational tree"""
    bulk_insert(db_session, sample_employees)

    hierarchy = build_org_hierarchy(db_session)

    # Verify paths
    assert hierarchy["CEO"]["hierarchy_path"] == ["CEO"]
    assert hierarchy["VP1"]["hierarchy_path"] == ["CEO", "VP1"]
    assert hierarchy["IC1"]["hierarchy_path"] == ["CEO", "VP1", "DIR1", "MGR1", "IC1"]

    # Verify leaf nodes
    assert hierarchy["IC1"]["is_leaf_node"] == True
    assert hierarchy["IC2"]["is_leaf_node"] == True
    assert hierarchy["MGR1"]["is_leaf_node"] == False

def test_hierarchy_cycle_detection(db_session):
    """FR-1.5: Detect circular reporting structures"""
    employees = [
        {"employee_id": "E1", "job_title": "Manager", "manager_id": "E2"},
        {"employee_id": "E2", "job_title": "Manager", "manager_id": "E3"},
        {"employee_id": "E3", "job_title": "Manager", "manager_id": "E1"},  # Cycle!
    ]
    bulk_insert(db_session, employees)

    with pytest.raises(HierarchyError, match="Cycle detected"):
        build_org_hierarchy(db_session)

def test_hierarchy_orphan_detection(db_session):
    """FR-1.5: Report orphaned employees (Success Metric: â‰¤1%)"""
    employees = [
        {"employee_id": "CEO", "job_title": "CEO", "manager_id": None},
        {"employee_id": "VP1", "job_title": "VP", "manager_id": "CEO"},
        {"employee_id": "ORPHAN", "job_title": "Engineer", "manager_id": "MISSING_MGR"},
    ]
    bulk_insert(db_session, employees)

    result = build_org_hierarchy(db_session)

    assert "ORPHAN" in result["orphans"]
    assert result["orphan_count"] == 1
    assert result["orphan_percentage"] == pytest.approx(33.3, rel=0.1)

def test_hierarchy_multiple_roots(db_session):
    """FR-1.5: Detect multiple top-level employees"""
    employees = [
        {"employee_id": "CEO1", "job_title": "CEO", "manager_id": None},
        {"employee_id": "CEO2", "job_title": "CEO", "manager_id": None},  # Two roots!
        {"employee_id": "VP1", "job_title": "VP", "manager_id": "CEO1"},
    ]
    bulk_insert(db_session, employees)

    result = build_org_hierarchy(db_session)

    assert len(result["root_nodes"]) == 2
    assert result["requires_review"] == True
    assert "Multiple root nodes detected" in result["warnings"]

def test_hierarchy_path_generation(db_session, sample_employees):
    """FR-1.4: Generate hierarchy_path for each employee"""
    bulk_insert(db_session, sample_employees)

    hierarchy = build_org_hierarchy(db_session)

    # Verify all employees have paths
    for emp_id in ["CEO", "VP1", "DIR1", "MGR1", "IC1"]:
        assert "hierarchy_path" in hierarchy[emp_id]
        assert isinstance(hierarchy[emp_id]["hierarchy_path"], list)
        assert emp_id == hierarchy[emp_id]["hierarchy_path"][-1]

def test_hierarchy_depth_calculation(db_session, sample_employees):
    """Calculate org depth for metrics"""
    bulk_insert(db_session, sample_employees)

    hierarchy = build_org_hierarchy(db_session)

    assert hierarchy["CEO"]["depth"] == 0
    assert hierarchy["VP1"]["depth"] == 1
    assert hierarchy["DIR1"]["depth"] == 2
    assert hierarchy["MGR1"]["depth"] == 3
    assert hierarchy["IC1"]["depth"] == 4
    assert hierarchy["max_depth"] == 4
```

### 2. O*NET Matching Tests (FR-2.1 through FR-2.5)

```python
def test_layer_1_exact_dictionary_match(onet_sample_data):
    """FR-2.1: Layer 1 - O*NET Sample Reported Titles"""
    result = match_title_to_onet(
        "Software Engineer",
        onet_data=onet_sample_data,
        max_layer=1
    )

    assert result.onet_soc == "15-1252.00"
    assert result.matching_layer == "layer_1"
    assert result.confidence >= 0.95
    assert result.method == "dictionary_exact"

def test_layer_2_contextual_fuzzy_match(onet_sample_data):
    """FR-2.2: Layer 2 - Contextual fuzzy with department"""
    result = match_title_to_onet(
        "Sr. Software Dev",
        department="Engineering",
        onet_data=onet_sample_data,
        max_layer=2
    )

    assert result.onet_soc == "15-1252.00"
    assert result.matching_layer == "layer_2"
    assert 0.7 <= result.confidence < 0.95
    assert result.method == "fuzzy_contextual"

def test_layer_3_embedding_match(onet_sample_data):
    """FR-2.3: Layer 3 - Embeddings (pgvector)"""
    result = match_title_to_onet(
        "Code Architect",
        onet_data=onet_sample_data,
        max_layer=3
    )

    assert result.onet_soc == "15-1252.00"
    assert result.matching_layer == "layer_3"
    assert 0.6 <= result.confidence < 0.9
    assert result.method == "embedding"

@pytest.mark.slow
@pytest.mark.external
def test_layer_4_onet_api_fallback(onet_sample_data):
    """FR-2.4: Layer 4 - O*NET Web Services API"""
    # Note: Requires O*NET API credentials
    result = match_title_to_onet(
        "Rare Obscure Job Title",
        onet_data=onet_sample_data,
        max_layer=4
    )

    assert result.matching_layer == "layer_4"
    assert result.method == "onet_api"

@pytest.mark.slow
@pytest.mark.llm
def test_layer_5_llm_match(onet_sample_data):
    """FR-2.5: Layer 5 - GPT-4o for edge cases"""
    with patch('openai.ChatCompletion.create') as mock_llm:
        mock_llm.return_value.choices[0].message.content = "15-1252.00|0.75"

        result = match_title_to_onet(
            "Blockchain Metaverse Engineer",
            onet_data=onet_sample_data,
            max_layer=5
        )

        assert result.onet_soc == "15-1252.00"
        assert result.matching_layer == "layer_5"
        assert result.method == "llm"
        mock_llm.assert_called_once()

def test_matching_cascade_stops_at_high_confidence():
    """FR-2: Cascade stops when confidence â‰¥ threshold"""
    with patch('match_layer_1') as mock_l1, \
         patch('match_layer_2') as mock_l2:

        mock_l1.return_value = {"onet_soc": "15-1252.00", "confidence": 0.95}

        result = match_title_to_onet("Software Engineer")

        # Should stop at Layer 1, never call Layer 2
        mock_l1.assert_called_once()
        mock_l2.assert_not_called()

def test_matching_confidence_threshold_review_queue():
    """FR-2.6: Low confidence â†’ review queue"""
    result = match_title_to_onet("Synergy Facilitator")

    assert result.confidence < 0.8
    assert result.requires_review == True
    assert result.review_reason == "low_confidence"

def test_matching_stores_metadata(db_session):
    """FR-2.6: Store matching metadata"""
    result = match_and_store_title(
        db_session,
        employee_id="E1",
        job_title="Software Engineer",
        department="Engineering"
    )

    match = db_session.query(ONetMatch).filter_by(employee_id="E1").first()

    assert match.onet_soc == "15-1252.00"
    assert match.confidence >= 0.9
    assert match.matching_layer in ["layer_1", "layer_2", "layer_3", "layer_4", "layer_5"]
    assert match.method_used is not None
    assert match.corrected_by is None  # Not manually corrected yet
```

### 3. Exposure Scoring Tests (FR-4)

```python
def test_exposure_score_openai_lookup(openai_exposure_data):
    """FR-4.1: Primary lookup from OpenAI pre-computed data (80% coverage)"""
    dwa_code = "4.A.2.a.4"

    score = get_exposure_score(dwa_code, exposure_data=openai_exposure_data)

    assert score.source == "openai_precomputed"
    assert score.dwa_code == dwa_code
    assert 0 <= score.E0 <= 1  # Overall exposure
    assert 0 <= score.E1 <= 1  # Direct exposure (Î±)
    assert 0 <= score.E2 <= 1  # Complementary exposure (Î²)
    assert score.E0 >= max(score.E1, score.E2)  # E0 â‰¥ max(E1, E2)

def test_exposure_score_llm_fallback(openai_exposure_data):
    """FR-4.2: LLM fallback for missing DWAs (20% coverage)"""
    unknown_dwa = "NEW.TASK.2025"

    with patch('openai.ChatCompletion.create') as mock_llm:
        mock_llm.return_value.choices[0].message.content = "E1|0.62|High routine, moderate autonomy"

        score = get_exposure_score(unknown_dwa, exposure_data=openai_exposure_data)

        assert score.source == "llm_fallback"
        assert score.exposure_level == "E1"
        assert score.estimated_score == pytest.approx(0.62, abs=0.05)
        assert "rubric" in score.metadata
        mock_llm.assert_called_once()

def test_exposure_zone_thresholds():
    """FR-4: Verify zone classification thresholds"""
    # Green zone: 85-100% (E2 - Full automation)
    assert classify_automation_zone(0.92).zone == "E2"
    assert classify_automation_zone(0.85).zone == "E2"

    # Blue zone: 40-84% (E1 - Augmentation)
    assert classify_automation_zone(0.84).zone == "E1"
    assert classify_automation_zone(0.50).zone == "E1"
    assert classify_automation_zone(0.40).zone == "E1"

    # Orange zone: 0-39% (E0 - Insulated)
    assert classify_automation_zone(0.39).zone == "E0"
    assert classify_automation_zone(0.20).zone == "E0"

def test_exposure_autonomy_levels(onet_sample_data):
    """FR-4.3: O*NET autonomy levels (1-5)"""
    result = get_task_autonomy(
        onet_soc="15-1252.00",
        dwa_code="4.A.2.a.4",
        onet_data=onet_sample_data
    )

    assert 1 <= result.autonomy_level <= 5
    assert result.autonomy_description is not None

def test_exposure_parameterized_weights():
    """FR-4.4: Configurable threshold weights"""
    config = {
        "E2_threshold": 0.85,
        "E1_threshold": 0.40,
        "E0_max": 0.39
    }

    result = classify_automation_zone(0.75, config=config)
    assert result.zone == "E1"

    # Change thresholds
    config["E1_threshold"] = 0.80
    result = classify_automation_zone(0.75, config=config)
    assert result.zone == "E0"  # Now below threshold

def test_aggregate_role_exposure_score(db_session, openai_exposure_data):
    """FR-4: Aggregate task scores to role-level"""
    # Setup: Role with multiple tasks
    setup_role_tasks(db_session, "15-1252.00", [
        {"dwa_code": "4.A.2.a.4", "importance": 4.5},  # E0=0.72
        {"dwa_code": "4.A.2.b.2", "importance": 4.0},  # E0=0.85
    ])

    result = calculate_role_exposure(
        onet_soc="15-1252.00",
        db=db_session,
        exposure_data=openai_exposure_data
    )

    # Weighted average by importance
    expected = (0.72 * 4.5 + 0.85 * 4.0) / (4.5 + 4.0)
    assert result.avg_exposure == pytest.approx(expected, abs=0.01)
    assert result.task_count == 2
```

### 4. Privacy Control Tests (RA-5)

```python
def test_leaf_node_anonymization(db_session, sample_employees):
    """RA-5.3: Anonymize individual contributors in manager views"""
    # Setup hierarchy
    bulk_insert(db_session, sample_employees)
    build_org_hierarchy(db_session)

    manager = get_user(db_session, "MGR1")

    # Get team members (IC1, IC2 are leaf nodes)
    team = get_team_members(db_session, manager)

    leaf_employees = [e for e in team if e.is_leaf_node]

    # Verify anonymization
    assert len(leaf_employees) == 2
    assert all(e.name == "Team Member" for e in leaf_employees)
    assert all(e.employee_id == "***" for e in leaf_employees)
    assert all(e.email is None for e in leaf_employees)

def test_minimum_cell_size_enforcement(db_session):
    """RA-5.1: Enforce Nâ‰¥5 minimum for aggregates"""
    # Setup: Department with only 3 employees
    employees = [
        {"employee_id": f"E{i}", "job_title": "Engineer",
         "department": "SmallTeam", "manager_id": "MGR"}
        for i in range(3)
    ]
    bulk_insert(db_session, employees)

    executive = get_user(db_session, "EXEC1", role=Role.EXECUTIVE)

    # Should raise error
    with pytest.raises(HTTPException, match="minimum 5 employees"):
        get_department_analytics(
            db_session,
            department="SmallTeam",
            user=executive
        )

def test_manager_can_only_see_reporting_line(db_session, sample_employees):
    """RA-5.2: Managers restricted to their subtree"""
    bulk_insert(db_session, sample_employees)
    build_org_hierarchy(db_session)

    # MGR1 manages IC1, IC2 under VP1â†’DIR1â†’MGR1
    manager = get_user(db_session, "MGR1")

    # Can see own team
    ic1 = get_employee_with_privacy(db_session, "IC1", manager)
    assert ic1 is not None

    # Cannot see VP2's team
    with pytest.raises(HTTPException, match="not in your reporting line"):
        get_employee_with_privacy(db_session, "VP2", manager)

def test_executive_cannot_see_individual_records(db_session):
    """RA-5.4: Executives limited to aggregates only"""
    executive = get_user(db_session, "EXEC1", role=Role.EXECUTIVE)

    with pytest.raises(HTTPException, match="can only view aggregated data"):
        get_employee_with_privacy(db_session, "IC1", executive)

def test_csuite_protection(db_session):
    """RA-5.4: C-suite excluded from individual analysis"""
    # Mark CEO as executive
    ceo = db_session.query(Employee).filter_by(employee_id="CEO").first()
    ceo.is_executive = True
    db_session.commit()

    manager = get_user(db_session, "MGR1", role=Role.MANAGER)

    # Even admins cannot see C-suite details (except other admins)
    with pytest.raises(HTTPException, match="C-suite records require admin"):
        get_employee_with_privacy(db_session, "CEO", manager)

def test_privacy_views_created(db_session):
    """Verify privacy database views exist"""
    # Check manager_team_view
    result = db_session.execute(
        "SELECT * FROM manager_team_view LIMIT 1"
    )
    assert result is not None

    # Check executive_dashboard_view
    result = db_session.execute(
        "SELECT * FROM executive_dashboard_view WHERE employee_count >= 5"
    )
    assert result is not None

def test_admin_can_see_all(db_session, sample_employees):
    """Admins bypass privacy restrictions"""
    bulk_insert(db_session, sample_employees)
    admin = get_user(db_session, "ADMIN1", role=Role.ADMIN)

    # Can see any employee
    for emp_id in ["CEO", "VP1", "IC1"]:
        employee = get_employee_with_privacy(db_session, emp_id, admin)
        assert employee.employee_id == emp_id
        assert employee.name != "Team Member"  # Not anonymized for admins
```

### 5. CSV Upload & Validation Tests (FR-1.1, FR-1.2)

```python
def test_csv_upload_valid(client, auth_headers):
    """FR-1.1: Upload valid CSV"""
    csv_data = create_test_csv([
        {"employee_id": "E1", "job_title": "CEO", "manager_id": ""},
        {"employee_id": "E2", "job_title": "VP", "manager_id": "E1"},
    ])

    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("employees.csv", csv_data, "text/csv")},
        headers=auth_headers("manager")
    )

    assert response.status_code == 200
    data = response.json()
    assert "upload_id" in data
    assert data["row_count"] == 2

def test_csv_upload_missing_columns(client, auth_headers):
    """FR-1.2: Reject CSV missing required columns"""
    csv_data = b"employee_id,department\nE1,Engineering"  # Missing job_title

    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("bad.csv", csv_data, "text/csv")},
        headers=auth_headers("manager")
    )

    assert response.status_code == 422
    assert "Missing required columns" in response.json()["detail"]["message"]
    assert "job_title" in str(response.json()["detail"]["errors"])

def test_csv_upload_sql_injection_prevention(client, auth_headers):
    """FR-1.2: Block SQL injection attempts"""
    csv_data = create_test_csv([
        {"employee_id": "E1", "job_title": "'; DROP TABLE employees; --",
         "manager_id": ""},
    ])

    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("malicious.csv", csv_data, "text/csv")},
        headers=auth_headers("manager")
    )

    assert response.status_code == 422
    assert "invalid characters" in response.json()["detail"]["message"].lower()

def test_csv_upload_size_limit(client, auth_headers):
    """Enforce 50MB file size limit"""
    large_csv = b"a" * (51 * 1024 * 1024)  # 51MB

    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("large.csv", large_csv, "text/csv")},
        headers=auth_headers("manager")
    )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()

def test_csv_upload_invalid_employee_id_format(client, auth_headers):
    """Validate employee_id format"""
    csv_data = create_test_csv([
        {"employee_id": "E@#$%1", "job_title": "Engineer", "manager_id": ""},
    ])

    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("bad_ids.csv", csv_data, "text/csv")},
        headers=auth_headers("manager")
    )

    assert response.status_code == 422
    assert "alphanumeric" in response.json()["detail"]["message"].lower()

def test_csv_upload_rbac_enforcement(client, auth_headers):
    """Only managers and admins can upload"""
    csv_data = create_test_csv([{"employee_id": "E1", "job_title": "CEO"}])

    # Analyst cannot upload
    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("test.csv", csv_data, "text/csv")},
        headers=auth_headers("analyst")
    )
    assert response.status_code == 403

    # Manager can upload
    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("test.csv", csv_data, "text/csv")},
        headers=auth_headers("manager")
    )
    assert response.status_code == 200
```

## Integration Testing

### API Integration Tests
```python
def test_upload_then_query_hierarchy(client, db_session, auth_headers):
    """Integration: CSV â†’ Hierarchy â†’ Query"""
    # Step 1: Upload CSV
    csv_data = create_test_csv(100)  # 100 employees
    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("employees.csv", csv_data, "text/csv")},
        headers=auth_headers("admin")
    )
    assert response.status_code == 200
    upload_id = response.json()["upload_id"]

    # Step 2: Build hierarchy
    response = client.post(f"/api/v1/uploads/{upload_id}/build-hierarchy")
    assert response.status_code == 202  # Async job

    # Wait for completion
    wait_for_job(client, upload_id, "hierarchy")

    # Step 3: Query hierarchy
    response = client.get(
        "/api/v1/employees/E50/hierarchy",
        headers=auth_headers("admin")
    )
    assert response.status_code == 200
    hierarchy = response.json()
    assert len(hierarchy["hierarchy_path"]) >= 1
    assert hierarchy["is_leaf_node"] in [True, False]

def test_complete_workflow_csv_to_dashboard(client, db_session, auth_headers):
    """Integration: Full pipeline CSV â†’ Matching â†’ Scoring â†’ Dashboard"""

    # Step 1: Upload CSV (FR-1)
    csv_data = create_realistic_csv(100)
    response = client.post(
        "/api/v1/uploads",
        files={"file": ("employees.csv", csv_data, "text/csv")},
        headers=auth_headers("admin")
    )
    upload_id = response.json()["upload_id"]

    # Step 2: Verify hierarchy built (FR-1.3, FR-1.4)
    wait_for_job(client, upload_id, "hierarchy")
    response = client.get(f"/api/v1/uploads/{upload_id}/hierarchy-report")
    hierarchy = response.json()
    assert hierarchy["total_employees"] == 100
    assert hierarchy["orphan_percentage"] < 2.0  # Success metric
    assert hierarchy["max_depth"] >= 3

    # Step 3: Trigger O*NET matching (FR-2)
    response = client.post(
        f"/api/v1/uploads/{upload_id}/match",
        headers=auth_headers("admin")
    )
    assert response.status_code == 202

    wait_for_job(client, upload_id, "matching")

    # Step 4: Verify matching results
    response = client.get(f"/api/v1/uploads/{upload_id}/match-report")
    matches = response.json()
    assert matches["automated_percentage"] >= 95.0  # Success metric
    assert matches["layer_1_percentage"] >= 70.0  # Layer 1 target
    assert matches["review_queue_count"] <= 5  # <5% review

    # Step 5: Trigger exposure scoring (FR-4)
    response = client.post(
        f"/api/v1/uploads/{upload_id}/score",
        headers=auth_headers("admin")
    )
    wait_for_job(client, upload_id, "scoring")

    # Step 6: Verify dashboard data (FR-6)
    response = client.get(
        "/api/v1/dashboard/executive",
        headers=auth_headers("executive")
    )
    dashboard = response.json()
    assert "automation_zones" in dashboard
    assert dashboard["total_fte_hours"] > 0
    assert len(dashboard["top_automation_roles"]) > 0

def test_manual_correction_workflow(client, db_session, auth_headers):
    """Integration: Low confidence â†’ Review queue â†’ Manual correction â†’ Audit"""

    # Step 1: Create low-confidence match
    match_id = create_low_confidence_match(db_session, confidence=0.65)

    # Step 2: Verify in review queue
    response = client.get(
        "/api/v1/matches/review-queue",
        headers=auth_headers("admin")
    )
    queue = response.json()
    assert any(m["id"] == match_id for m in queue["items"])

    # Step 3: Admin corrects match
    response = client.post(
        f"/api/v1/matches/{match_id}/correct",
        json={"new_onet_soc": "15-1252.00", "reason": "More accurate match"},
        headers=auth_headers("admin")
    )
    assert response.status_code == 200

    # Step 4: Verify audit trail (RA-6)
    response = client.get(
        f"/api/v1/audit/matches/{match_id}",
        headers=auth_headers("admin")
    )
    audit = response.json()
    assert audit["action"] == "manual_correction"
    assert "ADMIN" in audit["user_id"]
    assert audit["details"]["new_onet_soc"] == "15-1252.00"
```

### Database Integration Tests
```python
@pytest.mark.slow
def test_hierarchy_cte_performance_10k(db_session):
    """Test WITH RECURSIVE CTE performance with 10k employees"""
    # Generate 10k employee hierarchy
    employees = generate_org_hierarchy(10000, depth=6, branching_factor=5)
    bulk_insert(db_session, employees)

    # Time the CTE query
    import time
    start = time.time()

    result = db_session.execute("""
        WITH RECURSIVE org_tree AS (
            SELECT employee_id, manager_id, ARRAY[employee_id] as path, 0 as depth
            FROM employees
            WHERE manager_id IS NULL

            UNION ALL

            SELECT e.employee_id, e.manager_id, ot.path || e.employee_id, ot.depth + 1
            FROM employees e
            JOIN org_tree ot ON e.manager_id = ot.employee_id
            WHERE NOT e.employee_id = ANY(ot.path)
        )
        SELECT * FROM org_tree
    """)

    rows = result.fetchall()
    elapsed = time.time() - start

    # Should complete in <5 seconds (PRD requirement)
    assert elapsed < 5.0
    assert len(rows) == 10000

@pytest.mark.slow
def test_bulk_onet_matching_performance(db_session, onet_sample_data):
    """Test bulk O*NET matching performance"""
    # Insert 1000 employees with varied job titles
    employees = generate_realistic_employees(1000)
    bulk_insert(db_session, employees)

    import time
    start = time.time()

    # Bulk match
    results = bulk_match_to_onet(
        db_session,
        onet_data=onet_sample_data,
        batch_size=100
    )

    elapsed = time.time() - start

    # Should complete in reasonable time (~1 min for 1k employees)
    assert elapsed < 60
    assert len(results) == 1000

    # Check success metrics
    automated = sum(1 for r in results if r.confidence >= 0.8)
    assert automated / len(results) >= 0.95  # 95% automated
```

## Performance & Load Testing

```python
@pytest.mark.slow
@pytest.mark.benchmark
def test_10k_employee_matching_performance(db_session, onet_sample_data):
    """PRD Success Metric: 95% automated matching on 10k employees"""
    employees = generate_realistic_employees(10000)
    bulk_insert(db_session, employees)

    start_time = time.time()
    results = bulk_match_to_onet(db_session, onet_data=onet_sample_data)
    elapsed = time.time() - start_time

    # Performance target: <5 minutes for 10k employees
    assert elapsed < 300

    # Success metric: 95% automated
    automated = sum(1 for r in results if r.confidence >= 0.8)
    automated_pct = automated / len(results) * 100
    assert automated_pct >= 95.0

    # Layer distribution (FR-2)
    layer_1 = sum(1 for r in results if r.matching_layer == "layer_1")
    assert layer_1 / len(results) >= 0.70  # 70% Layer 1

@pytest.mark.benchmark
def test_dashboard_query_performance(db_session):
    """Dashboard queries should return in <2 seconds"""
    # Setup: 5k employees with complete data
    setup_complete_dataset(db_session, 5000)

    start = time.time()
    result = get_executive_dashboard(db_session)
    elapsed = time.time() - start

    assert elapsed < 2.0
    assert result is not None

@pytest.mark.load
def test_concurrent_api_requests(client, auth_headers):
    """Test API under concurrent load"""
    import concurrent.futures

    def make_request(i):
        return client.get(
            f"/api/v1/employees/E{i}",
            headers=auth_headers("admin")
        )

    # 50 concurrent requests
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(make_request, i) for i in range(50)]
        results = [f.result() for f in futures]

    # All should succeed
    assert all(r.status_code == 200 for r in results)
```

## E2E Testing (Playwright)

```python
from playwright.sync_api import Page, expect

def test_complete_user_workflow(page: Page):
    """E2E: Login â†’ Upload â†’ View Dashboard"""
    # 1. Login
    page.goto("http://localhost:3000/login")
    page.fill("#email", "admin@example.com")
    page.fill("#password", "test123")
    page.click("button[type='submit']")

    # 2. Upload CSV
    page.goto("http://localhost:3000/upload")
    page.set_input_files("#csv-upload", "tests/fixtures/employees.csv")
    page.click("#submit-upload")

    # Wait for processing
    expect(page.locator(".upload-success")).to_be_visible(timeout=30000)

    # 3. Build hierarchy
    page.click("#build-hierarchy-btn")
    expect(page.locator(".hierarchy-complete")).to_be_visible(timeout=60000)

    # 4. Run matching
    page.click("#run-matching-btn")
    expect(page.locator(".matching-complete")).to_be_visible(timeout=120000)

    # 5. View dashboard
    page.goto("http://localhost:3000/dashboard")
    expect(page.locator(".hierarchy-tree")).to_be_visible()
    expect(page.locator(".total-employees")).to_have_text("100")

    # 6. Verify privacy controls
    page.goto("http://localhost:3000/team")
    leaf_nodes = page.locator(".employee-card[data-is-leaf='true']")
    expect(leaf_nodes.first).to_contain_text("Team Member")  # Anonymized

def test_review_queue_workflow(page: Page):
    """E2E: Admin reviews low-confidence matches"""
    page.goto("http://localhost:3000/login")
    # Login as admin...

    page.goto("http://localhost:3000/review-queue")

    # Should see low-confidence matches
    expect(page.locator(".review-item")).to_have_count(5)

    # Correct first match
    page.click(".review-item:first-child .correct-btn")
    page.fill("#onet-soc-input", "15-1252.00")
    page.fill("#reason-input", "Better match based on job description")
    page.click("#submit-correction")

    # Verify audit trail
    expect(page.locator(".correction-saved")).to_be_visible()
    expect(page.locator(".audit-log")).to_contain_text("manual_correction")
```

## Test Data Management

```python
# tests/fixtures/sample_employees.csv
"""
employee_id,job_title,department,manager_id
CEO,Chief Executive Officer,Executive,
VP_ENG,VP Engineering,Engineering,CEO
VP_FIN,VP Finance,Finance,CEO
DIR_ENG,Director of Engineering,Engineering,VP_ENG
MGR_ENG1,Engineering Manager,Engineering,DIR_ENG
IC_ENG1,Software Engineer,Engineering,MGR_ENG1
IC_ENG2,Senior Software Engineer,Engineering,MGR_ENG1
"""

# tests/fixtures/onet_sample.json
{
    "occupations": [
        {"onet_soc": "15-1252.00", "title": "Software Developers"},
        {"onet_soc": "15-2051.00", "title": "Data Scientists"}
    ],
    "sample_titles": [
        {"onet_soc": "15-1252.00", "reported_title": "Software Engineer"},
        {"onet_soc": "15-1252.00", "reported_title": "Software Developer"}
    ]
}

# tests/fixtures/exposure_scores.csv
"""
dwa_code,E0,E1,E2
4.A.2.a.4,0.72,0.65,0.58
4.A.2.b.2,0.85,0.78,0.70
"""

@pytest.fixture
def sample_csv_data():
    """Load sample CSV for tests"""
    with open("tests/fixtures/sample_employees.csv", "rb") as f:
        return f.read()

@pytest.fixture
def onet_fixture_data():
    """Load O*NET sample data"""
    with open("tests/fixtures/onet_sample.json") as f:
        return json.load(f)

@pytest.fixture
def exposure_fixture_data():
    """Load exposure scores sample"""
    return pd.read_csv("tests/fixtures/exposure_scores.csv")
```

## AU Classification Eval Suite (tests/test_au_classification.py)

Added 2026-03-29. Tests the enriched Claude Haiku 4.5 company classifier with subdivision context.

### Test Categories (4 classes, 19 tests total)

| Class | Count | Description |
|-------|-------|-------------|
| `TestSearchFlags` | 4 | Validates `single_sector_asx` flag on ASX search results — companies with a single GICS-mapped sector get the flag; multi-sector conglomerates do not |
| `TestWorkforceProfile` | 2 | Census W12A mix loads correctly for a known ANZSIC division; composite-sector blending weights two division mixes by their employment share |
| `TestLLMClassification` | 11 (mark=llm) | Parametrized eval over 10 ASX companies (AGL, AusNet, Wesfarmers, Woolworths, Telstra, CSL, Origin, Macquarie, ANZ, REA). Each asserts `expected_primary` sector appears, optionally checks `expected_any` for multi-sector, and asserts `not_expected` codes are absent |
| `TestSubdivisionData` | 2 | DB: 214 rows in `anzsic_subdivisions`; 19 distinct `anzsic_division_code` values; Division D contains generation/distribution/gas sub-sectors |

### Running the eval

```bash
# All non-LLM AU tests (fast, no API key needed)
pytest tests/test_au_classification.py -m "not llm" -v

# Full eval including LLM classification (~$0.01, requires ANTHROPIC_AUTH_TOKEN)
pytest tests/test_au_classification.py -m llm -v

# Skip LLM tests project-wide
pytest -m "not llm"
```

### Eval results (2026-03-29 baseline, claude-haiku-4-5-20251001 + subdivision context)

| Metric | Result |
|--------|--------|
| Primary sector correct | 10/10 (100%) |
| Multi-sector detection | 10/11 (91%) — AusNet correctly single-sector; all diversified companies returned 2+ sectors |
| Improvement vs claude-3-haiku baseline | 64% → 91% multi-sector detection |

### `llm` marker — pyproject.toml registration

The `llm` marker is registered in `pyproject.toml` under `[tool.pytest.ini_options]`:

```toml
markers = [
    "llm: Tests that call LLM APIs (require ANTHROPIC_AUTH_TOKEN, incur cost)",
    ...
]
```

This ensures `pytest --markers` lists it and `-m "not llm"` works cleanly in CI.

---

## Test Categories (pytest markers)

```python
# conftest.py
def pytest_configure(config):
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "slow: Slow-running tests")
    config.addinivalue_line("markers", "benchmark: Performance benchmarks")
    config.addinivalue_line("markers", "external: Tests requiring external APIs")
    config.addinivalue_line("markers", "llm: Tests using LLM APIs (require API key, incur cost)")
    config.addinivalue_line("markers", "load: Load testing")

# Usage
@pytest.mark.unit
def test_parse_csv():
    pass

@pytest.mark.integration
def test_api_endpoint():
    pass

@pytest.mark.slow
@pytest.mark.benchmark
def test_large_dataset():
    pass

@pytest.mark.external
@pytest.mark.llm
def test_openai_api():
    pass

# Run specific categories
# pytest -m "unit"  # Only unit tests
# pytest -m "not slow"  # Skip slow tests
# pytest -m "integration and not external"  # Integration without external APIs
```

## CI/CD Pipeline Configuration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-asyncio

      - name: Run unit tests
        run: pytest -m "unit" --cov --cov-report=xml

      - name: Run integration tests
        run: pytest -m "integration and not external" --cov --cov-append

      - name: Check coverage
        run: pytest --cov --cov-fail-under=80 --cov-report=term

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Before Writing Tests

1. **Identify test boundaries**: What to test (business logic, API contracts, privacy controls)
2. **Choose test level**: Unit (80%), Integration (15%), E2E (5%)
3. **Prepare fixtures**: Sample CSVs, O*NET data, exposure scores
4. **Consider edge cases**: Cycles, orphans, missing data, low confidence
5. **Review PRD requirements**: Map tests to FR-X and RA-X requirements

## After Writing Tests

1. **Verify coverage**: `pytest --cov` (target: 80%+)
2. **Check performance**: Full suite should run in <5 minutes
3. **Update CI/CD**: Add new tests to pipeline
4. **Document scenarios**: Complex test cases need inline comments
5. **Review success metrics**: 95% automated, <1% orphans, Nâ‰¥5 enforced

## Current Test Count

| Suite | Tests | Notes |
|-------|-------|-------|
| test_data_invariants.py | 19 | Data invariant checks (ADR-002) |
| test_performance.py | 12 | Middleware headers, admin endpoints, P95 thresholds (mark=slow) |
| test_au_classification.py | 19 | AU classification eval (11 mark=llm, 8 non-LLM) |
| Other existing suites | 89 | FR-8.x coverage, pipeline DAG, FR-8.9 AU region, etc. |
| **Total** | **139** | 120 pre-session + 19 new AU classification tests |

LLM tests (`-m llm`) are excluded from CI by default. Run manually before releasing classifier changes.

---

## Implementation Checklist

- [ ] Unit tests for all 5 matching layers (FR-2)
- [ ] Hierarchy build tests (cycles, orphans, performance)
- [ ] Exposure scoring tests (E0/E1/E2, fallback)
- [ ] Privacy control tests (Nâ‰¥5, anonymization, RBAC)
- [ ] CSV validation tests (size, format, injection)
- [ ] Integration tests (CSV â†’ Dashboard)
- [ ] Performance benchmarks (10k employees, <5min)
- [ ] E2E tests (login â†’ upload â†’ dashboard)
- [ ] Audit logging tests (RA-6)
- [ ] Mock O*NET API responses
- [ ] Mock OpenAI API responses
- [ ] Coverage reports in CI/CD
- [ ] Test data fixtures committed
- [ ] All PRD success metrics validated

## References

- PRD Section 7 (Functional Requirements)
- PRD Section 8 (Dependencies & Build Sequence)
- PRD Section 9 (Success Metrics)
- pytest documentation
- FastAPI testing guide
- Playwright documentation
