import os

class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DATABASE_NAME: str = "docutrust"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    UPLOADS_DIR: str = os.getenv("UPLOADS_DIR", "/home/mohsinkhan/.gemini/antigravity/scratch/docutrust/uploads")
    FAISS_INDEX_DIR: str = os.getenv("FAISS_INDEX_DIR", "/home/mohsinkhan/.gemini/antigravity/scratch/docutrust/faiss_index")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "docutrust_super_secret_key_12345")
    EMBEDDINGS_MODEL_NAME: str = "all-MiniLM-L6-v2"
    CROSS_ENCODER_MODEL_NAME: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
os.makedirs(settings.FAISS_INDEX_DIR, exist_ok=True)
