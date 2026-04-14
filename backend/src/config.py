"""Configuration management for Anima"""

import os
from pathlib import Path
from typing import Annotated, Literal, Optional, Union

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, model_validator

from . import resources

from . import global_init

# Load environment variables
load_dotenv()


class ModelConfig(BaseModel):
    """Configuration for a model available in the UI"""

    name: str
    provider: str
    model: str
    description: str
    base_url: str
    api_key_env: Optional[str] = None
    temperature: float
    max_iterations: int


class AgentConfig(BaseModel):
    """Agent configuration"""

    max_tool_calls_per_iteration: int = 3
    system_prompt_dir: str = "src/agent/prompts/"
    force_tool_use: bool = True  # Require model to use tools


class LocalQdrantConfig(BaseModel):
    """Local Qdrant server configuration"""

    type: Literal["local"] = "local"


class CloudQdrantConfig(BaseModel):
    """Qdrant Cloud configuration"""

    type: Literal["cloud"] = "cloud"
    url: str
    api_key: str

    @model_validator(mode="after")
    def _apply_env_overrides(self) -> "CloudQdrantConfig":
        """Override with environment variables if present"""
        if url_env := os.getenv("QDRANT_URL"):
            self.url = url_env
        if api_key_env := os.getenv("QDRANT_API_KEY"):
            self.api_key = api_key_env
        return self


VectorDBConfig = Annotated[
    Union[LocalQdrantConfig, CloudQdrantConfig],
    Field(discriminator="type"),
]


class EmbeddingConfig(BaseModel):
    """Embedding configuration for a single provider"""

    name: str
    provider: str  # backend discriminator: "openai" or "mlx"
    api_key_env: Optional[str] = None
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    batch_size: int = 100
    max_length: int = 512


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
    style_pack_size: int = 10
    incremental_mode: IncrementalModeConfig = Field(
        default_factory=IncrementalModeConfig
    )


class Config(BaseModel):
    """Main configuration"""

    models: dict[str, ModelConfig]
    agent: AgentConfig
    vector_db: VectorDBConfig
    embeddings: dict[str, EmbeddingConfig]
    corpus: CorpusConfig
    retrieval: RetrievalConfig

    @classmethod
    def from_yaml(cls, config_path: str) -> "Config":
        """Load configuration from YAML file"""
        config_file = Path(config_path)
        if not config_file.exists():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")

        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)

        return cls(**config_data)

    def get_embedding(self, embedding_id: str) -> EmbeddingConfig:
        """Get embedding configuration by ID."""
        if embedding_id not in self.embeddings:
            available = ", ".join(self.embeddings.keys())
            raise ValueError(f"Embedding '{embedding_id}' not found. Available: {available}")
        return self.embeddings[embedding_id]

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


# Global config instance — resolve relative to the bundle Resources dir when
# frozen (py2app), otherwise relative to backend/ directory.
_config_path = resources.get_resource_path() / "config.yaml"

_config = global_init.uninit(Config)


def get_config() -> Config:
    """Get the global config instance (initialized at startup)."""
    return _config


def _init_config() -> None:
    """Initialize global config from YAML file at startup."""
    global _config  # pylint: disable=global-statement
    _config = Config.from_yaml(str(_config_path))


global_init.add(_init_config)
