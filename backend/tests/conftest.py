import os
import sys

from dotenv import load_dotenv

# 실제 .env 로드 — Redis.from_env()가 모듈 임포트 시 환경변수를 읽으므로 최우선 실행
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# backend/ 디렉토리를 모듈 탐색 경로에 추가
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
