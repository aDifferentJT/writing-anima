"""Configuration management for Anima"""

from pathlib import Path

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel

from . import resources

from . import global_init

# Load environment variables
load_dotenv()


class AgentConfig(BaseModel):
    """Agent configuration"""

    max_tool_calls_per_iteration: int = 3
    system_prompt_dir: str = "src/agent/prompts/"
    force_tool_use: bool = True  # Require model to use tools


# TODO check what this does, if it works, user facing
class RetrievalConfig(BaseModel):
    """Retrieval configuration"""

    default_k: int = 5
    max_k: int = 20


class Config(BaseModel):
    """Main configuration"""

    agent: AgentConfig
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
