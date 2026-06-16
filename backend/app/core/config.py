
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash-lite")
    CHAT_COOLDOWN_SECONDS = int(os.getenv("CHAT_COOLDOWN_SECONDS", "60"))

settings = Settings()
