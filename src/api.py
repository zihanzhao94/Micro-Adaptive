from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    from . import course_rag
except ImportError:
    import course_rag


app = FastAPI(title="Micro-Adaptive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MATERIALS_DIR = Path(__file__).resolve().parent.parent / "course_materials"
ALLOWED_EXTENSIONS = {".txt", ".pdf"}


def _safe_material_path(filename: str) -> Path:
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only .txt and .pdf course materials are supported.",
        )

    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    return MATERIALS_DIR / safe_name


def _list_materials() -> list[dict]:
    MATERIALS_DIR.mkdir(exist_ok=True)
    materials = []

    for path in sorted(MATERIALS_DIR.iterdir()):
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS:
            materials.append({
                "filename": path.name,
                "type": path.suffix.lower().lstrip("."),
                "size_bytes": path.stat().st_size,
            })

    return materials


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/materials")
def list_materials():
    return {"materials": _list_materials()}


@app.post("/materials/reindex")
def reindex_materials():
    try:
        course_rag.refresh_index()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reindex failed: {exc}") from exc

    return {
        "status": "reindexed",
        "materials": _list_materials(),
    }


@app.post("/materials/upload")
async def upload_material(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    save_path = _safe_material_path(file.filename)
    MATERIALS_DIR.mkdir(exist_ok=True)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    save_path.write_bytes(content)

    try:
        course_rag.refresh_index()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload saved but reindex failed: {exc}") from exc

    return {
        "status": "uploaded",
        "filename": save_path.name,
        "materials": _list_materials(),
    }
