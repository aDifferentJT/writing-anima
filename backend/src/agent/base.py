"""Base agent class for multi-model support"""

import logging
from abc import ABC, abstractmethod
from typing import Any, NamedTuple, Optional

from openai.types.chat import ChatCompletionMessageParam

from sqlmodel import Session, select

from ..api.models import Anima
from ..config import Config
from ..database.general import get_general_db
from ..database.vector import get_vector_db
from .. import resources
from .tools import CorpusSearchTool

logger = logging.getLogger(__name__)


class ToolCall(NamedTuple):
    """Record of a tool call made by the agent"""

    tool: str
    input: dict[str, Any]
    result_count: int


# TODO should this just be the same as ToolCall?
class ToolUse(NamedTuple):
    """Tool use from model response"""

    id: str
    name: str
    input: dict[str, Any]


class Response(NamedTuple):
    """Response from agent"""

    response: str
    tool_calls: list[ToolCall]
    iterations: int
    model: str
    error: Optional[str] = None


class BaseAgent(ABC):  # pylint: disable=too-many-instance-attributes,too-few-public-methods
    """Abstract base class for all model agents"""

    def __init__(
        self,
        anima_id: str,
        config: Config,
        use_json_mode: bool,
    ):
        """
        Initialize base agent.

        Args:
            anima_id: Anima identifier (e.g., "jules", "heidegger")
            config: Configuration object
        """
        self.config = config
        self.use_json_mode = use_json_mode
        self.anima_id = anima_id

        with Session(get_general_db()) as session:
            self.anima = session.exec(select(Anima).where(Anima.id == anima_id)).one()

        self.user_name = self.anima.name
        self.max_iterations = 20

        # Get shared vector database and collection for this anima
        collection = get_vector_db().get_collection(self.anima.collection_name)

        self.search_tool = CorpusSearchTool(
            collection,
            config,
            self.anima.embedding_provider,
        )

        self.prompt_file: Optional[str] = None
        self._current_tool_calls_count = 0

    @abstractmethod
    async def _call_model(self, system: str, messages: list[ChatCompletionMessageParam]) -> Any:
        """
        Call the underlying model API.

        Args:
            system: System prompt
            messages: Conversation messages

        Returns:
            Model response object
        """

    @abstractmethod
    def _parse_tool_use(self, response: Any) -> list[ToolUse]:
        """
        Extract tool calls from model response.

        Args:
            response: Model response object

        Returns:
            List of tool calls with format: [{"id": str, "name": str, "input": dict}]
        """

    @abstractmethod
    def _is_complete(self, response: Any) -> bool:
        """
        Check if model has finished responding.

        Args:
            response: Model response object

        Returns:
            True if model is done, False if it wants to use tools
        """

    @abstractmethod
    def _extract_text(self, response: Any) -> str:
        """
        Extract text content from model response.

        Args:
            response: Model response object

        Returns:
            Text content
        """

    @abstractmethod
    def _update_messages(
        self, messages: list[ChatCompletionMessageParam], response: Any, tool_results: list[Any]
    ) -> list[ChatCompletionMessageParam]:
        """
        Update message list with assistant response and tool results.

        Args:
            messages: Current message list
            response: Model response
            tool_results: Results from tool execution

        Returns:
            Updated message list
        """

    async def _build_system_prompt(self, prompt_file: str = "base.txt") -> str:
        """
        Build system prompt from template.

        Args:
            prompt_file: Name of the prompt file to use (default: "base.txt")

        Returns:
            System prompt string
        """
        # Load base prompt from prompts directory
        base_prompt_path = resources.get_prompts_path() / prompt_file

        with open(base_prompt_path, "r", encoding="utf-8") as f:
            base_prompt = f.read()

        # Format with user name
        prompt = base_prompt.format(user_name=self.user_name)

        # Add model-specific additions
        if model_specific := self._get_model_specific_prompt():
            prompt += "\n\n" + model_specific.format(user_name=self.user_name)

        # Add style pack for grounding (diverse writing samples stored on the anima)
        style_pack = self.anima.style_pack
        if style_pack:
            prompt += "\n\n" + "=" * 70
            prompt += f"\n\nSTYLE GROUNDING - {self.user_name}'s Writing Examples:\n"
            prompt += (
                f"The following are representative samples of how {self.user_name} "
                f"writes. Use these to match their style, tone, and communication "
                f"patterns.\n\n"
            )

            for i, sample in enumerate(style_pack, 1):
                prompt += f"\n--- Example {i} (from {sample.filename}) ---\n"
                text = sample.text
                if len(text) > 1000:
                    text = text[:1000] + "..."
                prompt += text + "\n"

            prompt += "\n" + "=" * 70
            prompt += (
                "\n\nCRITICAL STYLE INSTRUCTION: Your feedback must be written "
                "in the SAME VOICE, TONE, and STYLE as the examples above. "
            )
            prompt += (
                f"Emulate how {self.user_name} writes - their sentence structure, "
                f"vocabulary choices, rhetorical patterns, and communication style. "
            )
            prompt += (
                "Do not write generic feedback. Write feedback AS IF you are "
                "this author critiquing the work.\n"
            )
            logger.info("Style pack added to system prompt (%d examples)", len(style_pack))

        return prompt

    def _get_model_specific_prompt(self) -> Optional[str]:
        """
        Get model-specific prompt additions.
        Override in subclasses.

        Returns:
            Model-specific prompt or None
        """
        return None

    def _should_force_tool_use(self) -> bool:
        """
        Determine if tool use should be forced for this iteration.
        Only force on first iteration if force_tool_use is enabled.

        Returns:
            True if tools should be required, False otherwise
        """
        return self.config.agent.force_tool_use and self._current_tool_calls_count == 0

    async def _execute_tool(self, tool_use: ToolUse) -> Any:
        """
        Execute a tool call.

        Args:
            tool_use: Tool call dict with name and input

        Returns:
            Tool execution result
        """
        result: Any
        if tool_use.name == "search_corpus":
            try:
                result = await self.search_tool.search(**tool_use.input)
                logger.debug("Tool search returned %d results", len(result))
                return result
            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.error("Error executing search_corpus: %s", e)
                return {"error": str(e)}
        else:
            error_msg = f"Unknown tool: {tool_use.name}"
            logger.error("Unknown tool: %s", tool_use.name)
            return {"error": error_msg}

    async def respond(  # pylint: disable=too-many-locals
        self, query: str, conversation_history: Optional[list[ChatCompletionMessageParam]] = None
    ) -> Response:
        """
        Main agent loop - model self-orchestrates retrieval.

        Args:
            query: User query
            conversation_history: Optional list of previous messages

        Returns:
            Dict with response, tool_calls, iterations, and model name
        """
        # Use custom prompt file if agent has one
        prompt_file = self.prompt_file or "base.txt"
        system_prompt = await self._build_system_prompt(prompt_file)

        # Start with conversation history if provided
        if conversation_history:
            messages = conversation_history.copy()
        else:
            messages = []

        messages.append({"role": "user", "content": query})

        tool_calls_log: list[ToolCall] = []
        self._current_tool_calls_count = 0  # Track for tool_choice logic

        logger.info("Starting agent loop for query: %s...", query[:100])

        for iteration in range(self.max_iterations):
            logger.debug("Iteration %d/%d", iteration + 1, self.max_iterations)

            try:
                # Call model
                response = await self._call_model(system_prompt, messages)

                # Check if model is done
                if self._is_complete(response):
                    final_response = self._extract_text(response)
                    logger.info(
                        "Agent completed in %d iterations with %d tool calls",
                        iteration + 1, len(tool_calls_log)
                    )
                    return Response(
                        response=final_response,
                        tool_calls=tool_calls_log,
                        iterations=iteration + 1,
                        model=self.__class__.__name__,
                    )

                # Execute tool calls
                tool_uses = self._parse_tool_use(response)
                if tool_uses:
                    tool_results = []
                    for tool_use in tool_uses:
                        result = await self._execute_tool(tool_use)
                        tool_results.append(result)
                        tool_calls_log.append(
                            ToolCall(
                                tool=tool_use.name,
                                input=tool_use.input,
                                result_count=len(result) if isinstance(result, list) else 1,
                            )
                        )
                        self._current_tool_calls_count += 1  # Increment counter
                        result_count = (
                            len(result) if isinstance(result, list) else 1
                        )
                        logger.debug(
                            "Tool %s returned %d results",
                            tool_use.name, result_count
                        )

                    # Update conversation
                    messages = self._update_messages(messages, response, tool_results)
                else:
                    # No tools but not complete - add response and continue
                    text = self._extract_text(response)
                    if text:
                        logger.info("Agent completed with text response")
                        return Response(
                            response=text,
                            tool_calls=tool_calls_log,
                            iterations=iteration + 1,
                            model=self.__class__.__name__,
                        )

            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.error("Error in iteration %d: %s", iteration + 1, e)
                return Response(
                    response=f"Error: {e}",
                    tool_calls=tool_calls_log,
                    iterations=iteration + 1,
                    model=self.__class__.__name__,
                    error=str(e),
                )

        logger.warning("Max iterations (%d) reached", self.max_iterations)
        return Response(
            response="Max iterations reached without completion",
            tool_calls=tool_calls_log,
            iterations=self.max_iterations,
            model=self.__class__.__name__,
        )
