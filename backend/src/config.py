"""Configuration management for Anima"""

import os
from pathlib import Path
from typing import Optional

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# Load environment variables
load_dotenv()


class PersonaConfig(BaseModel):
    """Persona configuration"""

    name: str
    corpus_path: str
    collection_name: str
    description: Optional[str] = None
    # Optional per-persona overrides
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    similarity_threshold: Optional[float] = None


class ModelConfig(BaseModel):
    """Configuration for a model available in the UI"""

    name: str
    provider: str
    model: str
    description: str
    base_url: str
    api_key_env: Optional[str]
    temperature: float
    max_iterations: int


class AgentConfig(BaseModel):
    """Agent configuration"""

    max_tool_calls_per_iteration: int = 3
    system_prompt_dir: str = "src/agent/prompts/"
    force_tool_use: bool = True  # Require model to use tools


class VectorDBConfig(BaseModel):
    """Vector database configuration"""

    provider: str = "qdrant"
    host: str = "localhost"
    port: int = 6333
    api_key: Optional[str] = None

    def __init__(
        self,
        provider: str = "qdrant",
        host: str = "localhost",
        port: int = 6333,
        api_key: Optional[str] = None,
    ) -> None:
        """Override with environment variables if present"""

        self.provider = provider

        if host_env := os.getenv("QDRANT_HOST"):
            self.host = host_env
        else:
            self.host = host

        if port_env := os.getenv("QDRANT_PORT"):
            self.port = int(port_env)
        else:
            self.port = port

        if api_key_env := os.getenv("QDRANT_API_KEY"):
            self.api_key = api_key_env
        else:
            self.api_key = api_key


class EmbeddingConfig(BaseModel):
    """Embedding configuration"""

    provider: str = "openai"
    api_key_env: Optional[str] = None
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    batch_size: int = 100


class CorpusConfig(BaseModel):
    """Corpus processing configuration"""

    chunk_size: int = 800
    chunk_overlap: int = 100
    min_chunk_length: int = 100
    file_types: list[str] = Field(
        default_factory=lambda: [".txt", ".md", ".email", ".json"]
    )


class IncrementalModeConfig(BaseModel):
    """Incremental reasoning configuration for OOD queries"""

    enabled: bool = True
    ood_check_model: str = "gpt-4o-mini"
    max_corpus_concepts: int = 5


class RetrievalConfig(BaseModel):
    """Retrieval configuration"""

    default_k: int = 5
    max_k: int = 20
    similarity_threshold: float = 0.7
    style_pack_enabled: bool = False
    style_pack_size: int = 10
    incremental_mode: IncrementalModeConfig = Field(
        default_factory=IncrementalModeConfig
    )


class Config(BaseModel):
    """Main configuration"""

    personas: dict[str, PersonaConfig]
    models: dict[str, ModelConfig]
    agent: AgentConfig
    vector_db: VectorDBConfig
    embedding: EmbeddingConfig
    corpus: CorpusConfig
    retrieval: RetrievalConfig

    @classmethod
    def from_yaml(cls, config_path: str) -> "Config":
        """Load configuration from YAML file"""
        config_file = Path(config_path)
        if not config_file.exists():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")

        with open(config_file, "r") as f:
            config_data = yaml.safe_load(f)

        return cls(**config_data)

    def get_persona(self, persona_id: str) -> PersonaConfig:
        """
        Get persona configuration by ID.

        Args:
            persona_id: Persona identifier

        Returns:
            PersonaConfig for the requested persona

        Raises:
            ValueError: If persona_id not found
        """
        if persona_id not in self.personas:
            available = ", ".join(self.personas.keys())
            raise ValueError(
                f"Persona '{persona_id}' not found. Available personas: {available}"
            )

        return self.personas[persona_id]

    def get_model(self, model_id: str) -> ModelConfig:
        """
        Get model configuration by ID.

        Args:
            model_id: Model identifier

        Returns:
            ModelConfig for the requested model

        Raises:
            ValueError: If model_id not found
        """
        if model_id not in self.models:
            available = ", ".join(self.models.keys())
            raise ValueError(
                f"Model '{model_id}' not found. Available models: {available}"
            )

        return self.models[model_id]


# Global config instance
_config_path: str = "config.yaml"
_config: Config = Config.from_yaml(_config_path)


def get_config() -> Config:
    """Get or create global configuration instance"""
    return _config
