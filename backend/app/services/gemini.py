
from google import genai
from typing import AsyncIterator, Optional
import json
import asyncio
from app.core.config import settings

def serialize_usage_metadata(usage_metadata) -> Optional[dict]:
    if not usage_metadata:
        return None

    return {
        "prompt_token_count": usage_metadata.prompt_token_count,
        "cached_content_token_count": usage_metadata.cached_content_token_count,
        "candidates_token_count": usage_metadata.candidates_token_count,
        "tool_use_prompt_token_count": usage_metadata.tool_use_prompt_token_count,
        "thoughts_token_count": usage_metadata.thoughts_token_count,
        "total_token_count": usage_metadata.total_token_count,
    }

class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        self.model_name = settings.GEMINI_MODEL_NAME

    async def generate_response_stream(
        self, 
        message: str, 
        system_instruction: str = None,
        few_shot_examples: list[dict] = None
    ) -> AsyncIterator[str]:
        """
        Streaming response using latest google-genai (v1) SDK.
        Extracts all possible metadata including Thinking, Safety, and Usage.
        """
        try:
            yield json.dumps({"status": "thinking", "model": self.model_name}) + "\n"
            
            # Construct configuration
            config_params = {}
            if system_instruction:
                config_params['system_instruction'] = system_instruction
                
            # Construct content with few-shot examples if present
            request_contents = []
            
            if few_shot_examples:
                for example in few_shot_examples:
                    # Creating a turn for each example
                    if 'input' in example:
                        request_contents.append(
                            genai.types.Content(
                                role="user",
                                parts=[genai.types.Part.from_text(text=example['input'])]
                            )
                        )
                    if 'output' in example:
                        request_contents.append(
                            genai.types.Content(
                                role="model",
                                parts=[genai.types.Part.from_text(text=example['output'])]
                            )
                        )
            
            # Add the actual user message
            request_contents.append(
                genai.types.Content(
                    role="user",
                    parts=[genai.types.Part.from_text(text=message)]
                )
            )

            # Non-blocking async streaming
            response_iterator = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=request_contents,
                config=genai.types.GenerateContentConfig(**config_params) if config_params else None
            )
            
            yield json.dumps({"status": "generating"}) + "\n"
            
            full_text = ""
            usage_metadata = None
            finish_reason = None
            thought = None
            safety_ratings = None
            
            async for chunk in response_iterator:
                # 1. Text Streaming
                if chunk.text:
                    full_text += chunk.text
                    yield json.dumps({
                        "status": "streaming",
                        "chunk": chunk.text
                    }) + "\n"
                
                # 2. Extract Thought (Thinking process) from the chunk if available
                if chunk.candidates:
                    candidate = chunk.candidates[0]
                    
                    # Finish Reason
                    if candidate.finish_reason:
                        finish_reason = str(candidate.finish_reason)
                    
                    # Safety Ratings
                    if candidate.safety_ratings:
                        safety_ratings = [
                            {"category": str(sr.category), "probability": str(sr.probability)}
                            for sr in candidate.safety_ratings
                        ]

                    # Thought part
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, 'thought') and part.thought:
                                # Gemini 2.0+ models yield thought in specific parts
                                thought = part.text
                                break
                
                # 3. Usage Metadata (usually in the final chunk)
                if chunk.usage_metadata:
                    usage_metadata = serialize_usage_metadata(chunk.usage_metadata)
            
            # Emit the final "complete" event with ALL collected data
            yield json.dumps({
                "status": "complete",
                "response": full_text,
                "model_used": self.model_name,
                "thought": thought,
                "finish_reason": finish_reason,
                "safety_ratings": safety_ratings,
                "usage_metadata": usage_metadata,
            }) + "\n"

        except Exception as e:
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

gemini_service = GeminiService()
