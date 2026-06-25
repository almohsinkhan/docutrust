import os
import fitz  # PyMuPDF
import pickle
import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder
import faiss
from .config import settings

def extract_chunks_from_pdf(pdf_path: str, filename: str, chunk_size: int = 500, overlap: int = 50):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"Error opening PDF {pdf_path}: {e}")
        return []
        
    chunks = []
    num_pages = len(doc)
    
    for page_num in range(num_pages):
        page = doc[page_num]
        text = page.get_text("text")
        
        # Split into chunks of chunk_size characters with overlap
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end].strip()
            if chunk_text and len(chunk_text) > 10:
                chunks.append({
                    "text": chunk_text,
                    "filename": filename,
                    "page": page_num + 1,
                    "chunk_id": f"{filename}_p{page_num+1}_{start}"
                })
            start += chunk_size - overlap
            
    return chunks

class VectorStore:
    def __init__(self):
        self.index_dir = settings.FAISS_INDEX_DIR
        self.index_path = os.path.join(self.index_dir, "index.faiss")
        self.meta_path = os.path.join(self.index_dir, "metadata.pkl")
        self.model = None
        self.index = None
        self.chunks = []
        
    def load_model(self):
        if self.model is None:
            print(f"Loading embedding model: {settings.EMBEDDINGS_MODEL_NAME}...")
            self.model = SentenceTransformer(settings.EMBEDDINGS_MODEL_NAME)
            print("Embedding model loaded.")
            
    def load_index(self):
        if os.path.exists(self.index_path) and os.path.exists(self.meta_path):
            try:
                self.index = faiss.read_index(self.index_path)
                with open(self.meta_path, "rb") as f:
                    self.chunks = pickle.load(f)
                print(f"Loaded FAISS index with {len(self.chunks)} chunks.")
            except Exception as e:
                print(f"Error loading index: {e}")
                self.index = None
                self.chunks = []
        else:
            self.index = None
            self.chunks = []
            
    def save_index(self):
        if self.index is not None:
            faiss.write_index(self.index, self.index_path)
            with open(self.meta_path, "wb") as f:
                pickle.dump(self.chunks, f)
            print("Saved FAISS index.")
                
    def add_chunks(self, new_chunks):
        if not new_chunks:
            return
        self.load_model()
        texts = [c["text"] for c in new_chunks]
        embeddings = self.model.encode(texts, show_progress_bar=False)
        embeddings = np.array(embeddings).astype("float32")
        
        # L2 normalization for cosine similarity
        faiss.normalize_L2(embeddings)
        
        dimension = embeddings.shape[1]
        
        self.load_index()
            
        if self.index is None:
            self.index = faiss.IndexFlatIP(dimension)
            self.chunks = []
            
        self.index.add(embeddings)
        self.chunks.extend(new_chunks)
        self.save_index()
        
    def search(self, query: str, top_k: int = 5):
        self.load_model()
        self.load_index()
            
        if self.index is None or len(self.chunks) == 0:
            return []
            
        query_embedding = self.model.encode([query], show_progress_bar=False)
        query_embedding = np.array(query_embedding).astype("float32")
        faiss.normalize_L2(query_embedding)
        
        distances, indices = self.index.search(query_embedding, top_k)
        
        results = []
        for i, idx in enumerate(indices[0]):
            if idx == -1 or idx >= len(self.chunks):
                continue
            chunk = self.chunks[idx].copy()
            chunk["score"] = float(distances[0][i])
            results.append(chunk)
            
        return results

    def clear(self):
        if os.path.exists(self.index_path):
            os.remove(self.index_path)
        if os.path.exists(self.meta_path):
            os.remove(self.meta_path)
        self.index = None
        self.chunks = []
        print("FAISS index cleared.")

    def rebuild_index(self, all_uploaded_docs_paths):
        self.clear()
        all_chunks = []
        for filepath in all_uploaded_docs_paths:
            filename = os.path.basename(filepath)
            chunks = extract_chunks_from_pdf(filepath, filename)
            all_chunks.extend(chunks)
        if all_chunks:
            self.add_chunks(all_chunks)
        return len(all_chunks)

class Ranker:
    def __init__(self):
        self.model = None
        
    def load_model(self):
        if self.model is None:
            print(f"Loading Cross-Encoder model: {settings.CROSS_ENCODER_MODEL_NAME}...")
            self.model = CrossEncoder(settings.CROSS_ENCODER_MODEL_NAME)
            print("Cross-Encoder model loaded.")
            
    def rerank(self, query: str, chunks: list):
        if not chunks:
            return []
        self.load_model()
        pairs = [[query, chunk["text"]] for chunk in chunks]
        scores = self.model.predict(pairs)
        
        # Add score to chunks and sort
        for i, score in enumerate(scores):
            chunks[i]["rerank_score"] = float(score)
            
        # Sort by rerank score descending
        chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
        return chunks

vector_store = VectorStore()
ranker = Ranker()
