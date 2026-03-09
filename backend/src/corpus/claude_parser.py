"""Parser for Claude conversation JSON exports"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class ClaudeConversationParser:
    """Parse Claude conversation JSON exports"""

    def __init__(self):
        pass

    def parse_message(self, message: Dict[str, Any]) -> str:
        """
        Extract text from a single message.

        Args:
            message: Message dict with 'role' and 'content'

        Returns:
            Formatted message text
        """
        role = message.get("role", "unknown")
        content = message.get("content", "")

        # Handle different content formats
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            # Content might be a list of content blocks
            text_parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif "text" in block:
                        text_parts.append(block["text"])
                elif isinstance(block, str):
                    text_parts.append(block)
            text = "\n".join(text_parts)
        else:
            text = str(content)

        # Format with role prefix
        role_prefix = "User: " if role == "user" else "Assistant: "
        return f"{role_prefix}{text}"

    def parse_conversation(self, conversation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a single conversation.

        Args:
            conversation: Conversation dict with messages

        Returns:
            Dict with 'text' and 'metadata'
        """
        messages = conversation.get("messages", [])

        if not messages:
            # Try alternate formats
            if "chat_messages" in conversation:
                messages = conversation["chat_messages"]
            elif isinstance(conversation, list):
                messages = conversation

        # Extract and format messages
        formatted_messages = []
        for msg in messages:
            if isinstance(msg, dict):
                formatted_msg = self.parse_message(msg)
                if formatted_msg.strip():
                    formatted_messages.append(formatted_msg)

        # Combine into conversation text
        conversation_text = "\n\n".join(formatted_messages)

        # Extract metadata
        metadata: Dict[str, Any] = {
            "message_count": len(formatted_messages),
        }

        # Try to extract timestamp
        if "created_at" in conversation:
            metadata["created_at"] = conversation["created_at"]
        elif "updated_at" in conversation:
            metadata["created_at"] = conversation["updated_at"]

        # Try to extract conversation name/title
        if "name" in conversation:
            metadata["conversation_name"] = conversation["name"]
        elif "title" in conversation:
            metadata["conversation_name"] = conversation["title"]

        # Try to extract UUID
        if "uuid" in conversation:
            metadata["conversation_id"] = conversation["uuid"]
        elif "id" in conversation:
            metadata["conversation_id"] = str(conversation["id"])

        return {
            "text": conversation_text,
            "metadata": metadata,
        }

    def parse_json_file(self, json_path: Path) -> List[Dict[str, Any]]:
        """
        Parse Claude conversation JSON file.

        Args:
            json_path: Path to JSON file

        Returns:
            List of dicts with 'text' and 'metadata'
        """
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            conversations = []

            # Handle different JSON structures
            if isinstance(data, list):
                # Array of conversations
                for conv in data:
                    parsed = self.parse_conversation(conv)
                    if parsed["text"].strip():
                        conversations.append(parsed)

            elif isinstance(data, dict):
                # Single conversation or wrapper object
                if "conversations" in data:
                    # Wrapper with conversations array
                    for conv in data["conversations"]:
                        parsed = self.parse_conversation(conv)
                        if parsed["text"].strip():
                            conversations.append(parsed)
                elif "messages" in data or "chat_messages" in data:
                    # Single conversation
                    parsed = self.parse_conversation(data)
                    if parsed["text"].strip():
                        conversations.append(parsed)
                else:
                    logger.warning(f"Unknown JSON structure in {json_path}")
                    return []

            logger.info(f"Parsed {len(conversations)} conversations from {json_path.name}")
            return conversations

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {json_path}: {e}")
            return []
        except Exception as e:
            logger.error(f"Error parsing {json_path}: {e}")
            return []

    def parse_to_text(self, json_path: Path) -> str:
        """
        Parse JSON file and return as single text string.

        Args:
            json_path: Path to JSON file

        Returns:
            Combined text from all conversations
        """
        conversations = self.parse_json_file(json_path)

        # Combine all conversations with separators
        conversation_texts = []
        for i, conv in enumerate(conversations, 1):
            header = f"=== Conversation {i}"
            if "conversation_name" in conv["metadata"]:
                header += f": {conv['metadata']['conversation_name']}"
            header += " ==="

            conversation_texts.append(f"{header}\n\n{conv['text']}")

        return "\n\n" + "="*70 + "\n\n".join(conversation_texts)
