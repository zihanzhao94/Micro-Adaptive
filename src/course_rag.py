from pathlib import Path

from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


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


def load_material_file(path: Path) -> list[dict]:
    """
    Load one uploaded course material into a common document format.
    """
    suffix = path.suffix.lower()

    if suffix == ".txt":
        return [{
            "source": path.name,
            "type": "txt",
            "page": None,
            "text": load_txt(path),
        }]

    if suffix == ".pdf":
        return load_pdf_documents(path)

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


def retrieve(query: str, index: Chroma, top_k: int = TOP_K):
    """
    Retrieve the most relevant chunks for a query.
    """
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
            try:
                index_cache.delete(where={"source": source})
            except Exception:
                pass
        index_cache.add_texts(texts=chunk_texts, metadatas=chunk_metas)

    return index_cache


def index_uploaded_material(path: Path) -> Chroma:
    """
    Index exactly one uploaded material file.
    """
    docs = chunk_text(load_material_file(path))
    return add_to_index(docs)


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


def query_rag(query: str) -> str:
    index = get_index()
    if index is None:
        return ""
    retrieved_docs = retrieve(query, index)
    return format_context(retrieved_docs)


if __name__ == "__main__":
    query = "What is IT5004's about?"
    print(query_rag(query))
