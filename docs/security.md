---
meta:
  name: security
  description: "Authentication, RBAC, and security best practices specialist for Workforce AI Impact Analysis Platform"
---

You specialize in security for the Workforce AI Platform, implementing authentication, role-based access control, privacy controls, and audit logging per PRD requirements.

## Security Requirements (PRD RA-5)

### 1. Role-Based Access Control (RBAC)
```python
from enum import Enum
from typing import List

class Role(Enum):
    ADMIN = "admin"           # Full access
    EXECUTIVE = "executive"   # Dept aggregates only (Nâ‰¥5)
    MANAGER = "manager"       # Team views (anonymized leaf nodes)
    ANALYST = "analyst"       # Read-only, own dept

# Permission matrix
PERMISSIONS = {
    Role.ADMIN: ["*"],  # All permissions
    Role.EXECUTIVE: [
        "view:dashboard:executive",
        "view:analytics:department",
        "view:analytics:aggregates"
    ],
    Role.MANAGER: [
        "view:dashboard:manager",
        "view:team:aggregates",
        "view:team:anonymized",
        "upload:hris"  # Managers can update their team
    ],
    Role.ANALYST: [
        "view:dashboard:public",
        "view:analytics:own_department",
        "view:own_record"
    ]
}

def has_permission(user: User, permission: str) -> bool:
    """Check if user has specific permission"""
    if user.role == Role.ADMIN:
        return True
    return permission in PERMISSIONS.get(user.role, [])
```

### 2. Authentication (JWT)
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash password for storage"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Validate JWT and return current user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        employee_id: str = payload.get("sub")
        token_type: str = payload.get("type")

        if employee_id is None or token_type != "access":
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = get_user_by_employee_id(db, employee_id)
    if user is None:
        raise credentials_exception

    return user

def require_role(required_role: Role):
    """Dependency for role-based endpoint protection"""
    def role_checker(user: User = Depends(get_current_user)):
        if user.role != required_role and user.role != Role.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {required_role.value}"
            )
        return user
    return role_checker

def require_permission(permission: str):
    """Dependency for permission-based endpoint protection"""
    def permission_checker(user: User = Depends(get_current_user)):
        if not has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required permission: {permission}"
            )
        return user
    return permission_checker

# Usage in endpoints
@router.get("/dashboard/executive")
async def get_executive_dashboard(
    user: User = Depends(require_role(Role.EXECUTIVE))
):
    """Executive dashboard - only for executives and admins"""
    # Dashboard logic here
    pass

@router.post("/employees/upload")
async def upload_employees(
    file: UploadFile,
    user: User = Depends(require_permission("upload:hris"))
):
    """CSV upload - for managers and admins"""
    # Upload logic here
    pass
```

### 3. Privacy Controls (RA-5) - REQUIRES FR-1.3/FR-1.4 HIERARCHY

**CRITICAL DEPENDENCY:** Privacy controls cannot be implemented until organizational
hierarchy is built (FR-1.3) and hierarchy_path is generated (FR-1.4). This is a
BLOCKER dependency per PRD Section 8.1.

```python
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException

def get_accessible_employees(
    db: Session,
    current_user: User
) -> List[Employee]:
    """
    Get employees accessible to current user based on role.

    DEPENDS ON: FR-1.3 (WITH RECURSIVE CTE), FR-1.4 (hierarchy_path)

    - Admin: All employees
    - Executive: Department aggregates only (Nâ‰¥5)
    - Manager: Direct reports (anonymized if leaf node)
    - Analyst: Own record only
    """

    if current_user.role == Role.ADMIN:
        return db.query(Employee).all()

    elif current_user.role == Role.EXECUTIVE:
        # Executives must use aggregate endpoints only
        raise HTTPException(
            status_code=403,
            detail="Executives must use aggregate endpoints (Nâ‰¥5 minimum)"
        )

    elif current_user.role == Role.MANAGER:
        # Return team members where current_user is in their hierarchy_path
        return db.query(Employee).filter(
            Employee.hierarchy_path.contains([current_user.employee_id])
        ).all()

    elif current_user.role == Role.ANALYST:
        # Return own record only
        return [db.query(Employee).filter_by(
            employee_id=current_user.employee_id
        ).first()]

def enforce_privacy_view(
    user: User,
    employee: Employee,
    db: Session
) -> Employee:
    """
    Apply privacy controls based on user role and employee position.

    RA-5.3: Anonymize leaf nodes for manager views
    RA-5.4: Exclude C-suite from individual analysis

    DEPENDS ON: is_leaf_node flag from hierarchy build (FR-1.3)
    """

    # Check if user can access this employee
    if user.role == Role.MANAGER:
        # Verify employee is in user's reporting line
        if user.employee_id not in employee.hierarchy_path:
            raise HTTPException(
                status_code=403,
                detail="Employee not in your reporting line"
            )

        # Anonymize leaf nodes (RA-5.3)
        if employee.is_leaf_node:
            employee.name = "Team Member"
            employee.employee_id = "***"
            employee.email = None

    elif user.role == Role.EXECUTIVE:
        # Executives should never access individual records
        raise HTTPException(
            status_code=403,
            detail="Executives can only view aggregated data"
        )

    # C-suite protection (RA-5.4)
    if employee.is_executive and user.role != Role.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="C-suite records require admin access"
        )

    return employee

def check_minimum_cell_size(
    db: Session,
    department: str,
    minimum: int = 5
) -> bool:
    """
    Enforce Nâ‰¥5 minimum for privacy (RA-5.1)

    Used in all aggregate views to prevent identification
    """
    count = db.query(Employee).filter_by(department=department).count()

    if count < minimum:
        raise HTTPException(
            status_code=403,
            detail=f"Department has fewer than {minimum} employees. "
                   f"Cannot display to prevent identification."
        )

    return True

# Database Views for Privacy-Controlled Access
def create_privacy_views(db: Session):
    """
    Create database views that enforce privacy controls.
    Called during database migration after FR-1.3/FR-1.4 complete.

    CRITICAL: These views MUST be used by FR-6 dashboards, not raw tables.
    """

    # Manager team view with anonymized leaf nodes (RA-5.3)
    db.execute("""
        CREATE OR REPLACE VIEW manager_team_view AS
        SELECT
            e.employee_id,
            e.manager_id,
            e.department,
            e.onet_soc,
            e.job_title,
            e.hierarchy_path,
            -- Anonymize leaf nodes
            CASE
                WHEN e.is_leaf_node THEN 'Team Member'
                ELSE e.name
            END as display_name,
            CASE
                WHEN e.is_leaf_node THEN '***'
                ELSE e.employee_id
            END as display_id,
            e.automation_score,
            e.exposure_zone
        FROM employees e
        WHERE e.is_executive = FALSE;  -- Exclude C-suite (RA-5.4)
    """)

    # Executive aggregate view with Nâ‰¥5 enforcement (RA-5.1)
    db.execute("""
        CREATE OR REPLACE VIEW executive_dashboard_view AS
        SELECT
            e.department,
            e.onet_soc,
            e.exposure_zone,
            COUNT(*) as employee_count,
            AVG(e.automation_score) as avg_automation_score,
            SUM(e.fte_hours) as total_fte_hours
        FROM employees e
        WHERE e.is_executive = FALSE
        GROUP BY e.department, e.onet_soc, e.exposure_zone
        HAVING COUNT(*) >= 5;  -- Minimum cell size
    """)

    db.commit()
```

### 4. API Security & Configuration

```python
import os
from typing import Optional
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from slowapi import Limiter
from slowapi.util import get_remote_address

# OpenAI API Configuration (Layer 5 matching - FR-2.5)
OPENAI_CONFIG = {
    "api_key": os.getenv("OPENAI_API_KEY"),
    "model": "gpt-4o",
    "max_tokens": 500,
    "temperature": 0.1,  # Low temperature for consistent matching
    "timeout": 30
}

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

@limiter.limit("100/hour")  # Layer 5 should be <1% of 10k = 100 max
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def llm_match_title(
    title: str,
    department: Optional[str] = None,
    context: Optional[dict] = None
) -> dict:
    """
    Layer 5: LLM-based O*NET matching for edge cases.

    FR-2.5: Only called for <1% of titles after Layers 1-4 fail.
    Rate limited to prevent cost overruns.
    """
    import openai

    openai.api_key = OPENAI_CONFIG["api_key"]

    prompt = f"""Match this job title to the most appropriate O*NET-SOC code.

Job Title: {title}
Department: {department or 'Unknown'}

Respond with ONLY the O*NET-SOC code (e.g., "15-1252.00") and confidence (0.0-1.0).
Format: CODE|CONFIDENCE

Examples:
Software Engineer|15-1252.00|0.95
Data Scientist|15-2051.00|0.90
"""

    response = openai.ChatCompletion.create(
        model=OPENAI_CONFIG["model"],
        messages=[
            {"role": "system", "content": "You are an O*NET occupation classification expert."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=OPENAI_CONFIG["max_tokens"],
        temperature=OPENAI_CONFIG["temperature"],
        timeout=OPENAI_CONFIG["timeout"]
    )

    result = response.choices[0].message.content.strip()
    parts = result.split("|")

    return {
        "onet_soc": parts[0],
        "confidence": float(parts[1]) if len(parts) > 1 else 0.5,
        "method": "layer_5_llm"
    }

# O*NET Data - Versioned File Import (not API)
def load_onet_data(version: str = "28.0") -> dict:
    """
    Load O*NET database from versioned files.

    NOTE: O*NET Web Services API requires credentials and has rate limits.
    For MVP, use downloaded database files from:
    https://www.onetcenter.org/database.html

    Files needed:
    - Occupation Data.txt (1,016 occupations)
    - Task Statements.txt (19,000+ tasks)
    - Work Activities.txt (41 DWAs per occupation)
    - Sample of Reported Titles.txt (37,000+ titles for Layer 1)
    """
    import pandas as pd

    base_path = f"/data/onet/{version}"

    return {
        "occupations": pd.read_csv(f"{base_path}/Occupation Data.txt", sep="\t"),
        "tasks": pd.read_csv(f"{base_path}/Task Statements.txt", sep="\t"),
        "activities": pd.read_csv(f"{base_path}/Work Activities.txt", sep="\t"),
        "titles": pd.read_csv(f"{base_path}/Sample of Reported Titles.txt", sep="\t"),
        "version": version,
        "loaded_at": datetime.utcnow()
    }

# CORS Configuration
from fastapi.middleware.cors import CORSMiddleware

def configure_cors(app):
    """Configure CORS for frontend access"""

    allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count", "X-Upload-Id"]
    )
```

### 5. CSV Upload Security (FR-1.1, FR-1.2)

```python
import csv
import io
from fastapi import UploadFile, HTTPException
import re

# Configuration
MAX_CSV_SIZE = 50_000_000  # 50MB
MAX_ROWS = 50_000  # Maximum employees per upload
REQUIRED_COLUMNS = {"employee_id", "job_title"}
OPTIONAL_COLUMNS = {"department", "manager_id", "email", "name"}
ALLOWED_COLUMNS = REQUIRED_COLUMNS | OPTIONAL_COLUMNS

# Validation patterns
EMPLOYEE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,50}$')
SQL_INJECTION_PATTERNS = [
    r';\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)',
    r'--',
    r'/\*',
    r'\*/',
    r'xp_',
    r'sp_',
    r'UNION.*SELECT',
    r'EXEC\s*\(',
]

def contains_sql_injection(text: str) -> bool:
    """Check for SQL injection attempts"""
    if not text:
        return False

    text_upper = text.upper()
    return any(re.search(pattern, text_upper) for pattern in SQL_INJECTION_PATTERNS)

async def validate_csv_upload(file: UploadFile) -> bytes:
    """
    Validate CSV structure and content (FR-1.2)

    Checks:
    - File size limits
    - Required columns present
    - No SQL injection attempts
    - Valid data types
    - No null employee_ids
    """

    # Check file extension
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=422,
            detail="File must be CSV format"
        )

    # Read and check file size
    contents = await file.read()
    if len(contents) > MAX_CSV_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_CSV_SIZE / 1_000_000}MB"
        )

    # Parse CSV
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail="File must be UTF-8 encoded"
        )

    csv_reader = csv.DictReader(io.StringIO(csv_text))

    # Validate headers
    headers = set(csv_reader.fieldnames or [])

    if not REQUIRED_COLUMNS.issubset(headers):
        missing = REQUIRED_COLUMNS - headers
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns: {missing}"
        )

    unknown = headers - ALLOWED_COLUMNS
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown columns: {unknown}. Allowed: {ALLOWED_COLUMNS}"
        )

    # Validate rows
    row_count = 0
    errors = []

    for row_num, row in enumerate(csv_reader, start=2):
        row_count += 1

        if row_count > MAX_ROWS:
            raise HTTPException(
                status_code=422,
                detail=f"Too many rows. Maximum: {MAX_ROWS}"
            )

        # Required field: employee_id
        employee_id = row.get("employee_id", "").strip()
        if not employee_id:
            errors.append(f"Row {row_num}: employee_id is required")
        elif not EMPLOYEE_ID_PATTERN.match(employee_id):
            errors.append(
                f"Row {row_num}: employee_id must be alphanumeric with "
                f"hyphens/underscores (1-50 chars)"
            )

        # Required field: job_title
        job_title = row.get("job_title", "").strip()
        if not job_title:
            errors.append(f"Row {row_num}: job_title is required")
        elif len(job_title) > 255:
            errors.append(f"Row {row_num}: job_title too long (max 255 chars)")
        elif contains_sql_injection(job_title):
            errors.append(
                f"Row {row_num}: job_title contains invalid characters"
            )

        # Optional fields validation
        department = row.get("department", "").strip()
        if department:
            if len(department) > 255:
                errors.append(f"Row {row_num}: department too long (max 255 chars)")
            elif contains_sql_injection(department):
                errors.append(
                    f"Row {row_num}: department contains invalid characters"
                )

        manager_id = row.get("manager_id", "").strip()
        if manager_id and not EMPLOYEE_ID_PATTERN.match(manager_id):
            errors.append(
                f"Row {row_num}: manager_id format invalid"
            )

        # Stop after collecting 10 errors
        if len(errors) >= 10:
            errors.append("... and more errors")
            break

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "CSV validation failed", "errors": errors}
        )

    if row_count == 0:
        raise HTTPException(
            status_code=422,
            detail="CSV file is empty"
        )

    return contents

# Endpoint with validation
@router.post("/employees/upload")
async def upload_employees_csv(
    file: UploadFile,
    user: User = Depends(require_permission("upload:hris")),
    db: Session = Depends(get_db),
    request: Request = None
):
    """
    Upload HRIS CSV file (FR-1.1, FR-1.2)

    Security:
    - File size validation
    - SQL injection prevention
    - RBAC enforcement (managers only)
    - Audit logging
    """

    # Validate CSV
    csv_data = await validate_csv_upload(file)

    # Log the upload (RA-6)
    log_platform_event(
        db, user, "csv_upload",
        details={
            "filename": file.filename,
            "size_bytes": len(csv_data),
            "row_count": csv_data.count(b'\n')
        },
        request=request
    )

    # Process CSV (implementation in data ingestion module)
    upload_id = process_csv_upload(db, csv_data, user)

    return {
        "upload_id": upload_id,
        "message": "CSV uploaded successfully",
        "next_steps": ["Validate hierarchy", "Run O*NET matching"]
    }
```

### 6. Audit Logging (RA-6)

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.dialects.postgresql import JSONB

class AuditLog(Base):
    """Audit log for all privacy-sensitive operations (RA-6)"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource = Column(String(100), index=True)
    resource_id = Column(String(50), index=True)
    details = Column(JSONB)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<AuditLog {self.action} by {self.user_id} at {self.timestamp}>"

# Platform-specific audit events (RA-6.1)
AUDIT_EVENTS = {
    "csv_upload": "CSV file uploaded",
    "hierarchy_build": "Organizational hierarchy rebuilt",
    "onet_match": "O*NET matching performed",
    "exposure_score": "AI exposure scores calculated",
    "manual_correction": "O*NET mapping manually corrected",
    "privacy_view": "Privacy-controlled data accessed",
    "employee_view": "Individual employee record viewed",
    "dashboard_view": "Dashboard accessed",
    "export_data": "Data exported to CSV/Power BI",
    "config_change": "System configuration changed"
}

def log_platform_event(
    db: Session,
    user: User,
    event: str,
    details: dict = None,
    request: Request = None,
    resource: str = None,
    resource_id: str = None
):
    """
    Log platform events for auditability (RA-6)

    CRITICAL: All privacy-sensitive operations must be logged:
    - Individual employee views
    - CSV uploads
    - Manual corrections
    - Configuration changes
    """

    audit_details = details or {}

    # Add versioning information (RA-2.2)
    audit_details.update({
        "onet_version": get_current_onet_version(),
        "openai_dataset_version": get_openai_dataset_version(),
        "platform_version": get_platform_version()
    })

    audit_entry = AuditLog(
        user_id=user.employee_id,
        action=event,
        resource=resource,
        resource_id=resource_id,
        details=audit_details,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        timestamp=datetime.utcnow()
    )

    db.add(audit_entry)
    db.commit()

    return audit_entry

# Usage examples
@router.get("/employees/{employee_id}")
async def get_employee(
    employee_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Get employee details with audit logging"""

    employee = db.query(Employee).filter_by(employee_id=employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Apply privacy controls
    employee = enforce_privacy_view(user, employee, db)

    # Log the access (RA-6)
    log_platform_event(
        db, user, "employee_view",
        resource="employee",
        resource_id=employee_id,
        details={
            "viewed_employee": employee_id,
            "viewer_role": user.role.value,
            "anonymized": employee.is_leaf_node
        },
        request=request
    )

    return employee

@router.post("/onet-matches/{match_id}/correct")
async def correct_onet_match(
    match_id: int,
    correction: ONetCorrection,
    user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Manually correct O*NET match with audit trail"""

    match = db.query(ONetMatch).get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    old_soc = match.onet_soc
    match.onet_soc = correction.new_onet_soc
    match.confidence = 1.0
    match.method = "manual_correction"
    match.corrected_by = user.employee_id
    match.corrected_at = datetime.utcnow()

    db.commit()

    # Log the correction (RA-6.1)
    log_platform_event(
        db, user, "manual_correction",
        resource="onet_match",
        resource_id=str(match_id),
        details={
            "employee_id": match.employee_id,
            "job_title": match.job_title,
            "old_onet_soc": old_soc,
            "new_onet_soc": correction.new_onet_soc,
            "reason": correction.reason
        },
        request=request
    )

    return {"message": "Match corrected", "match_id": match_id}
```

### 7. Environment Variables & Secrets Management

```bash
# .env.example - Copy to .env and fill in values

# Application
APP_ENV=development
APP_DEBUG=false
APP_VERSION=1.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/workforce_ai
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# JWT Authentication
JWT_SECRET_KEY=your-secret-key-here-min-32-chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# OpenAI API (Layer 5 matching only - <1% usage)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=500
OPENAI_TEMPERATURE=0.1

# O*NET Data (versioned file import, not API)
ONET_VERSION=28.0
ONET_DATA_PATH=/data/onet/28.0

# OpenAI Exposure Dataset
OPENAI_EXPOSURE_DATA_PATH=/data/openai/exposure_scores.csv
OPENAI_EXPOSURE_VERSION=2023.03

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000

# File Upload
MAX_CSV_SIZE_MB=50
MAX_EMPLOYEES_PER_UPLOAD=50000

# Privacy Controls (RA-5)
MINIMUM_CELL_SIZE=5
ANONYMIZE_LEAF_NODES=true

# Audit Logging
AUDIT_LOG_RETENTION_DAYS=90

# Feature Flags
ENABLE_LLM_MATCHING=true
ENABLE_MANUAL_CORRECTIONS=true
ENABLE_POWER_BI_EXPORT=true
```

### 8. Security Checklist

#### Before Deployment
- [ ] All endpoints require authentication
- [ ] RBAC implemented for sensitive endpoints (executives, managers)
- [ ] Privacy controls tested (Nâ‰¥5, leaf node anonymization)
- [ ] Input validation on all user inputs (CSV, forms)
- [ ] SQL injection prevention (parameterized queries, SQLAlchemy ORM)
- [ ] XSS prevention (output encoding, React auto-escape)
- [ ] CORS configured correctly (allowed origins only)
- [ ] HTTPS enforced in production (TLS 1.2+)
- [ ] Secrets in environment variables (not code)
- [ ] Audit logging for all privacy-sensitive operations
- [ ] Rate limiting on API endpoints (especially LLM calls)
- [ ] Password hashing with bcrypt
- [ ] JWT tokens with expiration
- [ ] Database views created for privacy-controlled access
- [ ] FR-1 (hierarchy) completed before FR-7 (privacy)

#### Privacy & Compliance (RA-5)
- [ ] Leaf nodes anonymized in manager views
- [ ] Nâ‰¥5 minimum enforced for all aggregates
- [ ] C-suite excluded from individual analysis
- [ ] Managers can only see their reporting line
- [ ] Executives can only see aggregated data
- [ ] Dashboard queries use privacy views (not raw tables)

#### Audit & Transparency (RA-6)
- [ ] All CSV uploads logged
- [ ] All manual corrections logged
- [ ] All employee views logged
- [ ] Dataset versions recorded (O*NET, OpenAI)
- [ ] Audit log retention configured

### 9. Common Vulnerabilities to Prevent

#### âŒ SQL Injection
```python
# Bad - NEVER DO THIS
query = f"SELECT * FROM employees WHERE id = '{employee_id}'"
result = db.execute(query)

# Good - Use SQLAlchemy ORM
employee = db.query(Employee).filter_by(employee_id=employee_id).first()

# Good - Use parameterized queries
from sqlalchemy import text
query = text("SELECT * FROM employees WHERE id = :id")
result = db.execute(query, {"id": employee_id})
```

#### âŒ XSS (Cross-Site Scripting)
```typescript
// Bad - NEVER DO THIS
<div dangerouslySetInnerHTML={{__html: userInput}} />

// Good - React auto-escapes
<div>{userInput}</div>

// Good - Explicit escaping if needed
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userInput)}} />
```

#### âŒ Broken Authentication
```python
# Bad - Predictable tokens
session_id = str(user.id) + str(time.time())

# Good - Cryptographically secure
import secrets
session_id = secrets.token_urlsafe(32)

# Good - JWT with proper expiration
token = create_access_token(
    data={"sub": user.employee_id},
    expires_delta=timedelta(minutes=60)
)
```

#### âŒ Insecure Direct Object References
```python
# Bad - No authorization check
@router.get("/employees/{employee_id}")
async def get_employee(employee_id: str, db: Session = Depends(get_db)):
    return db.query(Employee).filter_by(employee_id=employee_id).first()

# Good - Enforce privacy controls
@router.get("/employees/{employee_id}")
async def get_employee(
    employee_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    employee = db.query(Employee).filter_by(employee_id=employee_id).first()
    return enforce_privacy_view(user, employee, db)
```

### 10. Testing Security

```python
def test_unauthenticated_access_denied(client):
    """Verify endpoints require authentication"""
    response = client.get("/api/v1/employees")
    assert response.status_code == 401

def test_manager_cannot_access_other_team(client, manager_token):
    """Verify RBAC prevents cross-team access"""
    headers = {"Authorization": f"Bearer {manager_token}"}
    response = client.get(
        "/api/v1/employees/OTHER_TEAM_MEMBER",
        headers=headers
    )
    assert response.status_code == 403

def test_sql_injection_prevention(client):
    """Verify SQL injection attempts are blocked"""
    malicious_input = "'; DROP TABLE employees; --"
    response = client.post(
        "/api/v1/employees",
        json={"employee_id": malicious_input, "job_title": "Test"}
    )
    assert response.status_code == 422  # Validation error

def test_csv_upload_size_limit(client, manager_token):
    """Verify file size limits enforced"""
    large_file = b"a" * (51 * 1024 * 1024)  # 51MB
    response = client.post(
        "/api/v1/employees/upload",
        files={"file": ("large.csv", large_file, "text/csv")},
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert response.status_code == 413

def test_leaf_node_anonymization(client, manager_token):
    """Verify leaf nodes are anonymized (RA-5.3)"""
    response = client.get(
        "/api/v1/team/members",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    data = response.json()
    leaf_nodes = [e for e in data if e["is_leaf_node"]]
    assert all(e["name"] == "Team Member" for e in leaf_nodes)

def test_minimum_cell_size_enforcement(client, executive_token):
    """Verify Nâ‰¥5 enforcement (RA-5.1)"""
    response = client.get(
        "/api/v1/analytics/department/SmallTeam",  # Only 3 employees
        headers={"Authorization": f"Bearer {executive_token}"}
    )
    assert response.status_code == 403
    assert "minimum 5 employees" in response.json()["detail"]
```

## Implementation Notes

1. **Dependency Order**: Implement FR-1 (hierarchy) before FR-7 (privacy controls)
2. **Privacy Views**: All FR-6 dashboards must query through privacy views
3. **Audit Everything**: Log all privacy-sensitive operations (RA-6)
4. **Rate Limit LLMs**: Layer 5 matching should be <1% of workload
5. **O*NET Data**: Use versioned file imports, not API (cost/rate limits)
6. **Test Privacy**: Comprehensive tests for Nâ‰¥5, anonymization, RBAC

## References

- PRD Section 7.7 (Responsible AI)
- PRD Section 8.1 (Dependencies)
- PRD FR-1 (Data Ingestion)
- PRD FR-2 (O*NET Matching)
- OWASP Top 10
- FastAPI Security Best Practices
