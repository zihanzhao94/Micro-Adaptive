import json
import os
from pathlib import Path
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma


MATERIALS_DIR = Path(__file__).resolve().parent.parent / "course_materials"
CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"

CHUNK_SIZE = 200
OVERLAP = 40
TOP_K = 3

index_cache = None


def load_txt(path: Path) -> str:
    """
    Load a plain text course material file.
    """
    return path.read_text(encoding="utf-8")


def load_pdf_documents(path: Path) -> list[dict]:
    """
    Load a PDF as page-level documents so retrieved context can cite page numbers.
    """
    loader = PyPDFLoader(str(path))
    pages = loader.load()
    docs = []

    for page in pages:
        docs.append({
            "source": path.name,
            "type": "pdf",
            "page": page.metadata.get("page"),
            "text": page.page_content,
        })

    return docs


def load_material_file(path: Path, course_id: str = "default") -> list[dict]:
    """
    Load one uploaded course material into a common document format.
    """
    suffix = path.suffix.lower()

    if suffix == ".txt":
        return [{
            "source": path.name,
            "course_id": course_id,
            "type": "txt",
            "page": None,
            "text": load_txt(path),
        }]

    if suffix == ".pdf":
        docs = load_pdf_documents(path)
        for doc in docs:
            doc["course_id"] = course_id
        return docs

    raise ValueError(f"Unsupported material type: {path.suffix}")


def chunk_text(docs: list[dict]) -> list[dict]:
    """
    Split each document into smaller text chunks for embedding.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=OVERLAP
    )

    for doc in docs:
        doc["chunks"] = splitter.split_text(doc["text"])

    return docs


def build_index(docs: list[dict]) -> Chroma:
    """
    Build and persist a Chroma vector store from chunked documents.
    """
    chunk_texts = []
    chunk_metas = []

    for doc in docs:
        for chunk_id, chunk in enumerate(doc["chunks"]):
            chunk_texts.append(chunk)
            chunk_metas.append({
                "source": doc["source"],
                "course_id": doc.get("course_id", "default"),
                "type": doc.get("type"),
                "page": doc.get("page"),
                "chunk_id": chunk_id,
            })

    if not chunk_texts:
        raise ValueError(f"No course material chunks found in {MATERIALS_DIR}")

    return Chroma.from_texts(
        texts=chunk_texts,
        metadatas=chunk_metas,
        embedding=OpenAIEmbeddings(),
        persist_directory=str(CHROMA_DIR)
    )


def load_existing_index() -> Chroma:
    """
    Load an existing persisted Chroma vector store from disk.
    """
    return Chroma(
        persist_directory=str(CHROMA_DIR),
        embedding_function=OpenAIEmbeddings(),
    )


def retrieve(query: str, index: Chroma, top_k: int = TOP_K, course_id: str = "default"):
    """
    Retrieve the most relevant chunks for a query.
    """
    try:
        return index.similarity_search(query, k=top_k, filter={"course_id": course_id})
    except TypeError:
        return index.similarity_search(query, k=top_k)


def format_context(retrieved_docs) -> str:
    """
    Format retrieved chunks into prompt-ready course context.
    """
    if not retrieved_docs:
        return ""

    context_lines = []

    for i, doc in enumerate(retrieved_docs):
        page = doc.metadata.get("page")
        page_label = f", page {page + 1}" if isinstance(page, int) else ""
        context_lines.append(
            f"Context {i + 1}\n"
            f"Source: {doc.metadata.get('source')}{page_label}\n"
            f"Text:\n{doc.page_content}"
        )

    return "\n\n".join(context_lines)


def add_to_index(docs: list[dict]) -> Chroma:
    """
    Add chunked documents to an existing Chroma index, or create one if needed.
    """
    global index_cache

    chunk_texts = []
    chunk_metas = []

    for doc in docs:
        for chunk_id, chunk in enumerate(doc["chunks"]):
            chunk_texts.append(chunk)
            chunk_metas.append({
                "source": doc["source"],
                "course_id": doc.get("course_id", "default"),
                "type": doc.get("type"),
                "page": doc.get("page"),
                "chunk_id": chunk_id,
            })

    if not chunk_texts:
        raise ValueError("No chunks found in uploaded material.")

    if index_cache is None and CHROMA_DIR.exists():
        index_cache = load_existing_index()

    if index_cache is None:
        index_cache = Chroma.from_texts(
            texts=chunk_texts,
            metadatas=chunk_metas,
            embedding=OpenAIEmbeddings(),
            persist_directory=str(CHROMA_DIR),
        )
    else:
        for source in {doc["source"] for doc in docs}:
            course_ids = {doc.get("course_id", "default") for doc in docs}
            try:
                for course_id in course_ids:
                    index_cache.delete(where={"$and": [{"source": source}, {"course_id": course_id}]})
            except Exception:
                try:
                    index_cache.delete(where={"source": source})
                except Exception:
                    pass
        index_cache.add_texts(texts=chunk_texts, metadatas=chunk_metas)

    return index_cache


def index_uploaded_material(path: Path, course_id: str = "default") -> Chroma:
    """
    Index exactly one uploaded material file.
    """
    docs = chunk_text(load_material_file(path, course_id))
    return add_to_index(docs)


def remove_material_from_index(filename: str, course_id: str) -> None:
    """Remove all vectors for one material without affecting another course."""
    index = get_index()
    if index is None:
        return

    metadata_filter = {"$and": [{"source": filename}, {"course_id": course_id}]}
    try:
        records = index.get(where=metadata_filter, include=[])
        ids = records.get("ids", [])
        if ids:
            index.delete(ids=ids)
    except Exception as exc:
        raise RuntimeError(f"Could not remove indexed chunks for {filename}: {exc}") from exc


def get_index() -> Chroma | None:
    """
    Return an in-memory index if available, otherwise load an existing persisted index.
    """
    global index_cache

    if index_cache is not None:
        return index_cache

    if CHROMA_DIR.exists():
        index_cache = load_existing_index()
        return index_cache

    return None


def refresh_index() -> Chroma:
    """
    Full local directory re-indexing is intentionally disabled.

    Use index_uploaded_material(path) from the upload API instead.
    """
    raise RuntimeError("Full local re-indexing is disabled. Use index_uploaded_material(path).")


def query_rag(query: str, course_id: str = "default") -> str:
    index = get_index()
    if index is None:
        return ""
    try:
        retrieved_docs = retrieve(query, index, course_id=course_id)
    except Exception:
        return ""
    return format_context(retrieved_docs)


def suggest_course_concepts(
    material_paths: list[Path],
    course_name: str,
    objectives: list[str] | None = None,
    existing_concepts: list[str] | None = None,
) -> list[str]:
    """Suggest high-level concepts from the course's uploaded materials.

    `existing_concepts` are reused verbatim wherever they fit. Each week's
    materials are read separately, so without this the same topic comes back
    worded differently each time ("Testing and Deployment" one week, "Software
    Testing and Deployment" another) and a student's mastery ends up split
    across near-duplicate concepts.

    The result is intentionally not persisted here. The educator must review and
    confirm it through the API before it becomes part of the course structure.
    """
    excerpts: list[str] = []
    remaining = 24_000
    for path in material_paths:
        if remaining <= 0 or not path.exists():
            break
        for doc in load_material_file(path):
            text = doc.get("text", "").strip()
            if not text:
                continue
            excerpt = text[:remaining]
            excerpts.append(f"Source: {path.name}\n{excerpt}")
            remaining -= len(excerpt)
            if remaining <= 0:
                break

    if not excerpts:
        raise ValueError("No readable uploaded course materials were found.")

    prompt = """
You are helping an educator define a course concept map.
Based only on the uploaded course material and stated learning objectives, suggest
5 to 12 high-level concepts. Prefer durable teachable topics, not slide headings,
week labels, individual tools, or overly narrow subtopics.

Exclude course-administration items such as assessment weightings, class
participation, assignment logistics, office hours or grading policy — they are not
concepts a student can be taught or quizzed on.

If an existing concept below already covers a topic in the material, reuse its name
EXACTLY as written rather than rephrasing it. Only add a new name for a topic none
of them cover. Avoid duplicates and do not invent content.

Return ONLY valid JSON in this exact shape:
{"concepts": ["Concept 1", "Concept 2"]}
"""
    llm = ChatOpenAI(temperature=0, openai_api_key=os.getenv("OPENAI_API_KEY"))
    raw = llm.invoke(
        f"Course: {course_name}\n"
        f"Learning objectives: {objectives or []}\n"
        f"Existing concepts (reuse these names exactly where they fit): {existing_concepts or []}\n\n"
        f"Uploaded material excerpts:\n{'\n\n'.join(excerpts)}\n\n{prompt}"
    ).content.strip()

    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:].strip()
    try:
        concepts = json.loads(raw).get("concepts", [])
    except json.JSONDecodeError as exc:
        raise ValueError("The concept suggestion response was not valid JSON.") from exc

    if not isinstance(concepts, list):
        raise ValueError("The concept suggestion response did not contain a concept list.")
    return [str(concept).strip() for concept in concepts if str(concept).strip()][:12]


if __name__ == "__main__":
    query = "What is IT5004's about?"
    print(query_rag(query))
