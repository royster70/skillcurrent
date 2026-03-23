from fastapi import FastAPI

app = FastAPI(
    title="Workforce AI Impact Analysis Platform",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
