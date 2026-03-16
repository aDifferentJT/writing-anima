"""Parser for Claude conversation JSON exports"""

import json
import logging
from typing import Any, NamedTuple, Optional

from fastapi import UploadFile

logger = logging.getLogger(__name__)


class ClaudeConversationParser:
    """Parse Claude conversation JSON exports"""

    class Conversation(NamedTuple):
        """A conversation with metadata"""
        text: str
        conversation_name: Optional[str]

    def __init__(self) -> None:
        pass

    def parse_message(self, message: dict[str, Any]) -> str:
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

    def parse_conversation(self, conversation: dict[str, Any]) -> Conversation:
        """
        Parse a single conversation.

        Args:
            conversation: Conversation dict with messages

        Returns:
            Conversation
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

        # Try to extract conversation name/title
        conversation_name: Optional[str]
        if "name" in conversation:
            conversation_name = conversation["name"]
        elif "title" in conversation:
            conversation_name = conversation["title"]

        return ClaudeConversationParser.Conversation(
            text=conversation_text,
            conversation_name=conversation_name,
        )

    def parse_json_file(self, json_file: UploadFile) -> list[Conversation]:
        """
        Parse Claude conversation JSON file.

        Args:
            json_fil: JSON file

        Returns:
            List of Conversations
        """
        try:
            data = json.load(json_file.file)

            conversations: list[ClaudeConversationParser.Conversation] = []

            # Handle different JSON structures
            if isinstance(data, list):
                # Array of conversations
                for conv in data:
                    parsed = self.parse_conversation(conv)
                    if parsed.text.strip():
                        conversations.append(parsed)

            elif isinstance(data, dict):
                # Single conversation or wrapper object
                if "conversations" in data:
                    # Wrapper with conversations array
                    for conv in data["conversations"]:
                        parsed = self.parse_conversation(conv)
                        if parsed.text.strip():
                            conversations.append(parsed)
                elif "messages" in data or "chat_messages" in data:
                    # Single conversation
                    parsed = self.parse_conversation(data)
                    if parsed.text.strip():
                        conversations.append(parsed)
                else:
                    logger.warning("Unknown JSON structure in %s", json_file.filename)
                    return []

            logger.info("Parsed %s conversations from %s", len(conversations), json_file.filename)
            return conversations

        except json.JSONDecodeError as e:
            logger.error("Invalid JSON in %s: %s", json_file.filename, e)
            return []
        except Exception as e:
            logger.error("Error parsing %s: %s", json_file.filename, e)
            return []

    def parse_to_text(self, json_file: UploadFile) -> str:
        """
        Parse JSON file and return as single text string.

        Args:
            json_file: JSON file

        Returns:
            Combined text from all conversations
        """
        conversations = self.parse_json_file(json_file)

        # Combine all conversations with separators
        conversation_texts = []
        for i, conv in enumerate(conversations, 1):
            header = f"=== Conversation {i}"
            if conv.conversation_name is not None:
                header += f": {conv.conversation_name}"
            header += " ==="

            conversation_texts.append(f"{header}\n\n{conv.text}")

        return "\n\n" + "="*70 + "\n\n".join(conversation_texts)
