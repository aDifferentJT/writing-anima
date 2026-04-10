"""Resource path resolution for frozen and development environments."""

import os
import sys
from pathlib import Path


def get_resource_path() -> Path:
    """
    Get the resource path for the application.

    In frozen apps (py2app), resources are in the bundle's Resources directory.
    In development, resources are relative to the backend/ directory.

    Returns:
        Path to the resources directory
    """
    if getattr(sys, "frozen", False):
        return Path(os.environ["RESOURCEPATH"])
    else:
        return Path(__file__).parent.parent


def get_build_path() -> Path:
    """
    Get the build directory path.

    In frozen apps (py2app), built artifacts are in the bundle's Resources directory.
    In development, built artifacts are in the build/ directory at the repo root.

    Returns:
        Path to the build directory
    """
    if getattr(sys, "frozen", False):
        return Path(os.environ["RESOURCEPATH"])
    else:
        return Path(__file__).parent.parent.parent.parent / "build"


def get_prompts_path() -> Path:
    """
    Get the prompts directory path.

    In frozen apps, prompts are in resources/agent/prompts.
    In development, prompts are in src/agent/prompts.

    Returns:
        Path to the prompts directory
    """
    if getattr(sys, "frozen", False):
        return Path(os.environ["RESOURCEPATH"]) / "agent" / "prompts"
    else:
        return Path(__file__).parent / "agent" / "prompts"
