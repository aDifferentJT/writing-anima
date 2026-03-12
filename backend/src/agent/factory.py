"""Agent factory for creating model-specific agents"""

import logging
from typing import Optional, Union

from ..config import Config, ModelConfig
from .base import BaseAgent
from .openai_agent import OpenAIAgent

logger = logging.getLogger(__name__)


class AgentFactory:
    """Factory for creating appropriate agent based on model selection"""

    @staticmethod
    def create(
        model: ModelConfig,
        persona_id: str,
        config: Config,
        use_json_mode: bool,
        prompt_file: str,
    ) -> BaseAgent:
        """
        Create an agent instance for the specified model.

        Args:
            model: Model
            persona_id: Persona identifier (e.g., "jules", "heidegger")
            config: Optional configuration object

        Returns:
            Agent instance

        Raises:
            ValueError: If model is not supported
        """
        persona = config.get_persona(persona_id)

        # OpenAI (gpt-4, gpt-3.5, etc)
        if model.provider == "openai":
            logger.info(f"Creating OpenAIAgent for persona: {persona.name}")
            return OpenAIAgent(
                persona_id=persona_id,
                config=config,
                model=model,
                use_json_mode=use_json_mode,
                prompt_file=prompt_file,
            )

        # DeepSeek (API)
        elif model.provider == "deepseek":
            logger.info(f"Creating DeepSeekAgent for persona: {persona.name}")
            return OpenAIAgent(
                persona_id=persona_id,
                config=config,
                model=model,
                use_json_mode=use_json_mode,
                prompt_file=prompt_file,
            )

        else:
            raise ValueError(
                f"Unsupported provider: {model.provider}. "
                f"Supported: openai, deepseek"
            )
