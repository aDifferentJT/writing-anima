"""Agent factory for creating model-specific agents"""

import logging
from typing import Optional, Union

from ..config import Config, get_config
from .base import BaseAgent
from .claude_agent import ClaudeAgent
from .deepseek_agent import DeepSeekAgent
from .hermes_agent import HermesAgent
from .kimi_multi import KimiMultiAgentPipeline
from .moonshot_agent import MoonshotAgent
from .openai_agent import OpenAIAgent

logger = logging.getLogger(__name__)


class AgentFactory:
    """Factory for creating appropriate agent based on model selection"""

    @staticmethod
    def create(
        model_name: str,
        persona_id: str,
        config: Optional[Config] = None,
    ) -> BaseAgent:
        """
        Create an agent instance for the specified model.

        Args:
            model_name: Model identifier (e.g., "claude", "deepseek", "hermes")
            persona_id: Persona identifier (e.g., "jules", "heidegger")
            config: Optional configuration object

        Returns:
            Agent instance

        Raises:
            ValueError: If model_name is not supported
        """
        if config is None:
            config = get_config()

        model_name_lower = model_name.lower()
        persona = config.get_persona(persona_id)

        # OpenAI (gpt-4, gpt-3.5, etc)
        if "gpt" in model_name_lower or "openai" in model_name_lower:
            logger.info(f"Creating OpenAIAgent for persona: {persona.name}")
            return OpenAIAgent(
                persona_id=persona_id,
                config=config,
                model=model_name if model_name.startswith("gpt") else config.model.openai.model,
            )

        # Claude
        elif "claude" in model_name_lower:
            logger.info(f"Creating ClaudeAgent for persona: {persona.name}")
            return ClaudeAgent(
                persona_id=persona_id,
                config=config,
                model=model_name if model_name.startswith("claude") else config.model.primary,
            )

        # DeepSeek V3.1 via OpenRouter (remote)
        elif (
            "openrouter" in model_name_lower
            or model_name_lower == "deepseek-v3.1-openrouter"
        ):
            logger.info(
                f"Creating DeepSeekAgent (OpenRouter) for persona: {persona.name}"
            )
            return DeepSeekAgent(
                persona_id=persona_id,
                config=config,
                model=config.model.openrouter.model,
                config_section="openrouter",
            )

        # DeepSeek V3.1 via exo-labs (local)
        elif "exo" in model_name_lower or model_name_lower == "deepseek-v3.1":
            logger.info(
                f"Creating DeepSeekAgent (exo-labs local) for persona: {persona.name}"
            )
            return DeepSeekAgent(
                persona_id=persona_id,
                config=config,
                model=config.model.exo.model,
                config_section="exo",
            )

        # DeepSeek (API)
        elif "deepseek" in model_name_lower:
            logger.info(f"Creating DeepSeekAgent for persona: {persona.name}")
            return DeepSeekAgent(
                persona_id=persona_id,
                config=config,
                model=model_name
                if model_name.startswith("deepseek")
                else config.model.deepseek.model,
            )

        # Kimi Multi-Agent Pipeline (new decomposed architecture for K2)
        elif "kimi-multi" in model_name_lower or "k2-multi" in model_name_lower:
            logger.info(f"Creating KimiMultiAgentPipeline for persona: {persona.name}")
            return KimiMultiAgentPipeline(
                persona_id=persona_id,
                config=config,
                model=config.model.moonshot.model,
            )

        # Moonshot / Kimi (legacy monolithic agent)
        elif "moonshot" in model_name_lower or "kimi" in model_name_lower:
            logger.info(f"Creating MoonshotAgent for persona: {persona.name}")
            return MoonshotAgent(
                persona_id=persona_id,
                config=config,
                model=model_name
                if model_name.startswith("moonshot")
                else config.model.moonshot.model,
            )

        # Hermes
        elif "hermes" in model_name_lower:
            logger.info(f"Creating HermesAgent for persona: {persona.name}")
            return HermesAgent(
                persona_id=persona_id,
                config=config,
                model=model_name if "/" in model_name else config.model.hermes.model,
            )

        else:
            raise ValueError(
                f"Unsupported model: {model_name}. "
                f"Supported: openai (gpt-4, gpt-3.5), claude, deepseek, deepseek-v3.1 (exo), kimi-multi, moonshot, hermes"
            )
