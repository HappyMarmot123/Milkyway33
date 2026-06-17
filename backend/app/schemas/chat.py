
from typing import Optional, List, Any
from pydantic import BaseModel


class ChatHistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    system_instruction: Optional[str] = None
    few_shot_examples: Optional[List[dict[str, str]]] = None
    history: List[ChatHistoryMessage] = []


class SummarizeRequest(BaseModel):
    messages: List[ChatHistoryMessage]


class UsageMetadata(BaseModel):
    prompt_token_count: Optional[int] = None
    cached_content_token_count: Optional[int] = None
    candidates_token_count: Optional[int] = None
    tool_use_prompt_token_count: Optional[int] = None
    thoughts_token_count: Optional[int] = None
    total_token_count: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    model_used: str
    thought: Optional[str] = None
    finish_reason: Optional[str] = None
    safety_ratings: Optional[List[Any]] = None
    usage_metadata: Optional[UsageMetadata] = None
