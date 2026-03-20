"""Agent factory for creating model-specific agents"""

import logging

from ..config import Config, ModelConfig
from .base import BaseAgent
from .openai_agent import OpenAIAgent

logger = logging.getLogger(__name__)


def create_agent(
    model: ModelConfig,
    anima_id: str,
    config: Config,
    use_json_mode: bool,
    prompt_file: str,
) -> BaseAgent:
    if model.provider in ("openai", "deepseek"):
        logger.info("Creating OpenAIAgent for anima: %s", anima_id)
        return OpenAIAgent(
            anima_id=anima_id,
            config=config,
            model=model,
            use_json_mode=use_json_mode,
            prompt_file=prompt_file,
        )

    raise ValueError(
        f"Unsupported provider: {model.provider}. "
        f"Supported: openai, deepseek"
    )
