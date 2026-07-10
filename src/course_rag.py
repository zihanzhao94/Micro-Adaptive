from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path
import numpy as np

MATERIALS_DIR = Path(__file__).resolve().parent.parent / "course_materials"

CHUNK_SIZE = 200
OVERLAP = 40


def load_documents():
    """
    load all documents from the course_materials directory into directory
    
    Args:
        None
    Returns:
        List[Dict]: A list of documents, where each document is a dictionary with keys "source" and "text"
    """
    docs = []

    for path in MATERIALS_DIR.glob("*.txt"):
        text = path.read_text(encoding="utf-8")
        docs.append({
            "source": path.name,
            "text": text,
        })

    return docs

def chunk_text(docs):
    """
    Chunks the text in the documents into smaller chunks.

    Args:
        docs (List[Dict]): A list of documents, where each document is a dictionary with keys "source" and "text"
    Returns:
        List[Dict]: A list of documents, where each document is a dictionary with keys "source", "text" and "chunks" where "chunks" is a list of chunks of the text
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=OVERLAP
    )
    for doc in docs:
        text = doc["text"]
        doc["chunks"] = splitter.split_text(text)
    return docs    

#TODO：always embed docs, consider change to cache or local db
def build_index(docs):
    """
    Builds vector from chunks in docs

    Args:
        documents (List[Dict]): A list of documents, where each document is a
    Returns:
        Dict: A dictionary with keys "chunks" and "embeddings"
    """
    
    embedder = OpenAIEmbeddings()
    chunk_metas = [] # each chunk contains the source and text
    chunk_text = [] # each chunk contains the text for conversion to embedding
    
    for doc in docs:
        for chunk in doc["chunks"]:
            chunk_text.append(chunk)
            chunk_metas.append({
                "source": doc["source"],
                "text": chunk, 
            })
    vectors = embedder.embed_documents(chunk_text)
    return {"chunks": chunk_metas, "embeddings": vectors}  # make sure chunks[i] and embedding[i] have a one-to-one correspondence


def retrieve(query, index):
    """
    Retrieves relevant documents from the index based on the query.

    Args:
        query (str): The search query.
        index (Dict): The index built from the documents.

    Returns:
        List[Dict]: A list of relevant documents.
    """
    embedder = OpenAIEmbeddings()
    query_embedding = embedder.embed_query(query) #convert query to embedding
    vector_matrix = np.array(index["embeddings"]) # convert list of list to matrix to make it easier to compute the similarity
    query_vector = np.array(query_embedding)

    #Compute the dot product between the query vector and all chunk vectors
    scores = np.dot(vector_matrix, query_vector)
    scores /= np.linalg.norm(vector_matrix, axis=1) * np.linalg.norm(query_vector)

    #Get the top k most similar chunks
    top_k = 3
    top_k_indices = np.argsort(scores)[::-1][:top_k]
    retrieved_docs = [index["chunks"][i] for i in top_k_indices]

    return retrieved_docs
    

def format_context(retrieved_docs):
    """
    Formats the retrieved documents into a context string.

    Args:
        documents (List[Dict]): A list of relevant documents.

    Returns:
        str: A formatted context string.
    """
    context_lines = []
    # loop through the documents and format the source and text to one string
    for i, doc in enumerate(retrieved_docs):
        context_lines.append(f"Context {i+1}\nSource: {doc['source']}\nText:\n{doc['text']}")
    return "\n\n".join(context_lines)

# wrapper to make it easier to use in agent
index_cache = None
def get_index():
    global index_cache # modify global var
    # if none load file else use global cache
    if index_cache is None:
        docs = load_documents()
        docs = chunk_text(docs)
        index_cache = build_index(docs)
    return index_cache

def query_rag(query):
    index = get_index()
    retrieved_docs = retrieve(query, index)
    return format_context(retrieved_docs)
    
    
        
if __name__ == "__main__":
    docs = load_documents()
    docs = chunk_text(docs)
    index = build_index(docs)
    query = "Who is 5004's prof"
    retrieve_docs = retrieve(query, index)
    context = format_context(retrieve_docs)
    print(context)

    