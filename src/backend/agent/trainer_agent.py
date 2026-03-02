import json
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from agent.log import LOGGER
from agent.tools.context_tools import comprehensive_athlete_overview
from agent.tools.tools import tools_trainer_agent
from agent.utils import initialize_llm, write_to_stream
from dotenv import load_dotenv
from langchain_core.messages import AnyMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

load_dotenv()


# Enhanced State Management
class TrainerPhase(Enum):
    """Simplified trainer agent phases"""

    INITIAL_ASSESSMENT = "initial_assessment"
    COMPLETE = "complete"


class ConversationContext(TypedDict):
    """Simplified context"""

    thread_id: str
    session_count: int


class TrainerAgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    user_id: str
    thread_id: str
    phase: TrainerPhase
    training_request: str
    conversation_context: ConversationContext
    assessment_result: Optional[Dict[str, Any]]
    scheduled_workouts: Optional[List[Dict[str, Any]]]
    action_plan: Optional[List[Dict[str, Any]]]
    questions_for_user: Optional[List[str]]
    execution_results: Optional[List[Dict[str, Any]]]
    final_response: Optional[str]
    error: Optional[str]
    needs_continuation: bool
    requires_user_input: bool


llm = initialize_llm("google/gemini-2.5-flash")

# Use tools from centralized tools.py
# Bind tools to LLM
llm_with_tools = llm.bind_tools(tools_trainer_agent)


async def node_assess_training_status(state: TrainerAgentState, config: dict) -> dict:
    """Comprehensive assessment of training status and request complexity.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata for tracing
    """
    LOGGER.info("🚀 Starting enhanced training status assessment")

    write_to_stream(
        {
            "type": "status",
            "content": "Analyzing training request and current status...",
        }
    )

    user_id = state["user_id"]
    training_request = state["training_request"]
    context = state["conversation_context"]

    # Keep it simple - no complex scenario analysis
    context["scenario_type"] = "general_adjustment"

    # Get comprehensive athlete overview and ensure serializable
    athlete_overview = comprehensive_athlete_overview(user_id=user_id)
    athlete_overview = _make_json_serializable(athlete_overview)

    # Enhanced prompt to ensure tool usage
    system_prompt = f"""You are an expert trainer. You MUST use tools to complete requests - NEVER just explain what you would do.

    TRAINING REQUEST: {training_request}

    ATHLETE OVERVIEW:
    {json.dumps(athlete_overview, indent=2)}

    MANDATORY STEPS FOR ANY REQUEST:
    1. ALWAYS start by calling get_scheduled_workouts to see current workouts
    2. For deletion requests: Call workout_delete for each relevant workout_scheduled_id
    3. For modifications: Call workout_modify with the workout details
    4. For new workouts: Call workout_create with the workout details

    REMEMBER: You MUST call the tools. Do not explain what you would do - actually do it by calling the tools."""

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Call get_scheduled_workouts first, then execute: {training_request}",
        },
    ]

    # Direct execution with tool usage - ensure tools are available
    LOGGER.info(f"Available tools: {[tool.name for tool in tools_trainer_agent]}")

    # Force tool usage by explicitly requiring get_scheduled_workouts first
    try:
        response = await llm_with_tools.ainvoke(
            messages,
            config=config,
            tool_choice={
                "type": "function",
                "function": {"name": "get_scheduled_workouts"},
            },
        )
        LOGGER.info(f"LLM response content: '{response.content}'")
        LOGGER.info(f"LLM response has tool_calls: {hasattr(response, 'tool_calls')}")
        if hasattr(response, "tool_calls"):
            LOGGER.info(f"Tool calls: {response.tool_calls}")
    except Exception as e:
        LOGGER.warning(f"Failed to force specific tool, falling back to auto: {e}")
        response = await llm_with_tools.ainvoke(
            messages, config=config, tool_choice="auto"
        )
        LOGGER.info(f"Fallback LLM response content: '{response.content}'")
        LOGGER.info(
            f"Fallback LLM response has tool_calls: {hasattr(response, 'tool_calls')}"
        )
        if hasattr(response, "tool_calls"):
            LOGGER.info(f"Fallback Tool calls: {response.tool_calls}")

    # Ensure response content is not None for Langfuse tracking
    if response.content is None:
        response.content = ""

    # Simple assessment result
    assessment_result = {
        "scenario_type": "general_adjustment",
        "complexity": "SIMPLE",
        "response": response.content,
        "athlete_overview": athlete_overview,
        "timestamp": datetime.now().isoformat(),
    }

    return {
        "messages": [response],  # Keep the original response with tool_calls
        "assessment_result": assessment_result,
        "conversation_context": context,
    }


async def node_determine_strategy(state: TrainerAgentState, config: dict) -> dict:
    """Continue conversation with LLM if tools were executed and more actions needed.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata for tracing
    """
    LOGGER.info("🚀 Determining next strategy")

    messages = state.get("messages", [])

    # Check if the last message is a tool result - if so, continue conversation
    if messages and len(messages) >= 2:
        # If we have a tool message as the last message, continue the conversation
        if hasattr(messages[-1], "name") and messages[-1].name:  # It's a ToolMessage
            LOGGER.info(
                "Tool execution completed, continuing conversation for next steps"
            )

            # Ask LLM to continue based on tool results
            training_request = state.get("training_request", "")

            # Build conversation with tool results
            conversation_messages = []
            for msg in messages[-2:]:  # Get the last AI message and tool response
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    conversation_messages.append(
                        {
                            "role": "assistant",
                            "content": msg.content,
                            "tool_calls": [
                                {
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc["name"],
                                        "arguments": str(tc["args"]),
                                    },
                                }
                                for tc in msg.tool_calls
                            ],
                        }
                    )
                elif hasattr(msg, "name") and msg.name:  # ToolMessage
                    conversation_messages.append(
                        {
                            "role": "tool",
                            "content": msg.content,
                            "tool_call_id": msg.tool_call_id,
                        }
                    )

            # Continue conversation based on tool results
            training_request = state.get("training_request", "")

            conversation_messages.append(
                {
                    "role": "user",
                    "content": f"Based on the tool results above, now complete the request: {training_request}",
                }
            )
            # Continue conversation with LLM
            response = await llm_with_tools.ainvoke(
                conversation_messages, config=config
            )
            LOGGER.info(f"Continuation LLM response content: '{response.content}'")
            LOGGER.info(
                f"Continuation LLM has tool_calls: {hasattr(response, 'tool_calls') and bool(response.tool_calls)}"
            )

            # Ensure response content is not None for Langfuse tracking
            if response.content is None:
                response.content = ""

            return {
                "messages": [response],
                "phase": TrainerPhase.INITIAL_ASSESSMENT
                if (hasattr(response, "tool_calls") and response.tool_calls)
                else TrainerPhase.COMPLETE,
            }

    # Default to completion
    return {"phase": TrainerPhase.COMPLETE}


# Removed complex clarification and execution nodes - keeping it simple


async def node_finalize_response(state: TrainerAgentState) -> dict:
    """Simple finalization - return the LLM's response."""
    LOGGER.info("🚀 Finalizing trainer agent response")

    # Get the response from the assessment/execution phase
    assessment_result = state.get("assessment_result", {})
    final_response = assessment_result.get("response", "Training adjustment completed.")

    return {
        "final_response": final_response,
        "phase": TrainerPhase.COMPLETE,
        "needs_continuation": False,
    }


async def node_tool_execution(state: TrainerAgentState, config: dict) -> dict:
    """Execute any tool calls during the process.

    Args:
        state: The current agent state
        config: The runnable config (required by LangGraph, contains configurable params)
    """
    LOGGER.info("🚀 Executing trainer tools")

    messages = state.get("messages", [])

    # Check if last message has tool calls
    if messages and hasattr(messages[-1], "tool_calls") and messages[-1].tool_calls:
        try:
            tool_node = ToolNode(tools_trainer_agent)

            # Create a new config without Langfuse callbacks for tool execution
            # This prevents Langfuse from trying to trace tool executions as ChatOpenAI calls
            from langchain_core.runnables import RunnableConfig

            tool_config = RunnableConfig(
                configurable=config.get("configurable", {}),
                # Explicitly set callbacks to empty list to exclude Langfuse
                callbacks=[],
            )

            # Execute tools with modified config (no Langfuse tracing)
            result = await tool_node.ainvoke(state, config=tool_config)

            # Ensure result has proper format
            if not isinstance(result, dict):
                LOGGER.warning(f"Tool node returned non-dict result: {type(result)}")
                result = {"messages": []}
            elif "messages" not in result:
                LOGGER.warning("Tool node result missing 'messages' key")
                result["messages"] = []

            # CRITICAL: Ensure all tool messages have defined content (not None/undefined)
            # This prevents Langfuse from encountering undefined outputs
            from langchain_core.messages import ToolMessage

            for msg in result.get("messages", []):
                if isinstance(msg, ToolMessage):
                    # Handle None content
                    if msg.content is None:
                        msg.content = "Tool executed successfully (no output)"
                    # Handle empty string content
                    elif msg.content == "":
                        msg.content = "Tool executed successfully (no output)"
                    # Handle dict content (should be serialized by ToolNode, but ensure it's valid)
                    elif isinstance(msg.content, dict):
                        import json

                        try:
                            msg.content = json.dumps(msg.content, ensure_ascii=False)
                        except Exception as e:
                            LOGGER.warning(f"Failed to serialize dict content: {e}")
                            msg.content = str(msg.content)
                    # Ensure content is always a string
                    elif not isinstance(msg.content, str):
                        msg.content = str(msg.content)

                    # Final validation: ensure it's not just whitespace
                    if isinstance(msg.content, str) and msg.content.strip() == "":
                        msg.content = "Tool executed successfully (no output)"

            return result

        except Exception as e:
            from uuid import uuid4

            from langchain_core.messages import ToolMessage

            LOGGER.error(f"Error in trainer tool execution: {e}", exc_info=True)
            # Return error as a ToolMessage
            error_msg = ToolMessage(
                content=f"Tool execution failed: {str(e)}",
                tool_call_id=str(uuid4()),
            )
            return {"messages": [error_msg]}

    return {}


def should_continue_conversation(state: TrainerAgentState) -> str:
    """Simplified conversation flow - go straight to finalize."""
    phase = state.get("phase", TrainerPhase.INITIAL_ASSESSMENT)

    if phase == TrainerPhase.COMPLETE:
        return "finalize"
    else:
        return "determine_strategy"


def should_use_tools(state: TrainerAgentState) -> str:
    """Determine if tools should be executed."""
    messages = state.get("messages", [])

    if messages and hasattr(messages[-1], "tool_calls") and messages[-1].tool_calls:
        return "tools"
    return "determine_strategy"


def route_after_execution(_: TrainerAgentState) -> str:
    """Route after execution phase."""
    return "finalize"


# Create enhanced workflow graph
workflow = StateGraph(TrainerAgentState)

# Add simplified nodes
workflow.add_node("assess", node_assess_training_status)
workflow.add_node("determine_strategy", node_determine_strategy)
workflow.add_node("finalize", node_finalize_response)
workflow.add_node("tools", node_tool_execution)

# Add edges
workflow.set_entry_point("assess")
workflow.add_conditional_edges(
    "assess",
    should_use_tools,
    {"tools": "tools", "determine_strategy": "determine_strategy"},
)
workflow.add_conditional_edges(
    "determine_strategy",
    should_continue_conversation,
    {
        "finalize": "finalize",
        "determine_strategy": "determine_strategy",
    },
)
workflow.add_edge("finalize", END)
workflow.add_edge("tools", "determine_strategy")


# Compile the enhanced graph
trainer_agent = workflow.compile()


async def astream_trainer_agent(
    training_request: str,
    user_id: str,
    thread_id: str,
    continuation_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Enhanced trainer agent with multi-session orchestration capabilities.

    Args:
        training_request: The training adjustment or modification request
        user_id: User identifier
        thread_id: Thread identifier for conversation tracking
        continuation_context: Context from previous session if continuing

    Returns:
        Final response and continuation state if needed
    """
    write_to_stream(
        {"type": "status", "content": "Enhanced trainer agent analyzing request..."}
    )

    try:
        # Simple context - no complex conversation management needed
        context = {"thread_id": thread_id, "session_count": 1}

        # Simple initial state
        initial_state = {
            "user_id": user_id,
            "thread_id": thread_id,
            "training_request": training_request,
            "phase": TrainerPhase.INITIAL_ASSESSMENT,
            "conversation_context": context,
            "messages": [HumanMessage(content=training_request)],
        }

        # Stream through the enhanced workflow
        final_state = None
        async for event in trainer_agent.astream(initial_state):
            LOGGER.info(f"Enhanced trainer agent event: {event}")
            final_state = event

        # Extract final result
        if final_state:
            last_node_state = list(final_state.values())[-1]

            final_response = last_node_state.get(
                "final_response", "Training adjustment completed."
            )

            # Simple response - no complex continuation logic
            return {
                "type": "tool_result",
                "content": {
                    "response": final_response,
                    "thread_id": thread_id,
                },
            }

        # Fallback response
        return {
            "type": "tool_result",
            "content": {
                "response": "Unable to process training request",
            },
        }

    except Exception as e:
        LOGGER.error(f"Enhanced trainer agent error: {e}")
        write_to_stream({"type": "error", "content": "Trainer agent error"})

        return {
            "type": "tool_result",
            "content": {
                "response": f"Error processing request: {str(e)}",
            },
        }


# Helper functions for enhanced functionality
def _make_json_serializable(obj):
    """Convert numpy types and other non-serializable types to JSON serializable formats."""
    import numpy as np

    if isinstance(obj, dict):
        return {key: _make_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [_make_json_serializable(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif hasattr(obj, "__dict__"):
        return _make_json_serializable(obj.__dict__)
    else:
        return obj


# Removed complex scenario handling - keeping it simple and direct


if __name__ == "__main__":
    import asyncio

    async def test_enhanced_trainer_agent():
        """Test the enhanced trainer agent with complex scenarios."""

        # Test illness scenario
        LOGGER.info("Testing illness scenario...")
        result1 = await astream_trainer_agent(
            training_request="I'm sick with a cold and won't be able to train for the next week. Please adjust my schedule.",
            user_id="2e04d74c-3d0b-45bc-83a0-bbdd8640b6a5",
            thread_id="test_illness",
        )
        LOGGER.info(f"Illness result: {result1}")

        # Test clarification scenario
        LOGGER.info("\nTesting clarification scenario...")
        result2 = await astream_trainer_agent(
            training_request="Make my training harder",
            user_id="2e04d74c-3d0b-45bc-83a0-bbdd8640b6a5",
            thread_id="test_clarification",
        )
        LOGGER.info(f"Clarification result: {result2}")

    asyncio.run(test_enhanced_trainer_agent())
