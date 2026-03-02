# Agent System

LangChain-based multi-agent AI coaching system in `src/backend/agent/`.

!!! info
    I actually want to rewrite the whole agent system and move away from the LangChain agent framework

    If you have ideas or suggestions feel free to reach out in Discord or open a discussion on GitHub.


## Architecture

Multi-agent system with a central orchestrator, specialized sub-agents, custom tool ecosystem, and Anthropic Claude integration.

### Design Principles

- Modular agent architecture
- Clear agent responsibilities
- Extensible tool system
- Contextual routing

## Main Agent

Central orchestrator in `agent/main_agent.py`. Uses LangChain with Anthropic Claude models.

- Routes user queries to appropriate sub-agents
- Coordinates multi-agent workflows
- Maintains conversation context
- Applies persona characteristics

## Sub-Agents

Specialized agents in `agent/sub_agents/`.

- **Query Agent**: Handles data analysis and fitness metrics queries
- **Trainer Agent**: Provides coaching advice and generates training plans
- **Workout Management Agent**: Manages structured workouts and schedules


## Tools

Custom tools in `agent/tools/`.


### Adding Tools

1. Create tool function with LangChain decorator
2. Define input schema
3. Register with appropriate agent

## Integration

Accessed through chat WebSocket in the FASTAPI backend.
