import os
from typing import Annotated, List, Optional, TypedDict
from uuid import uuid4

import psycopg2
from agent.core.error_handler import handle_error
from agent.core.singletons import get_llm
from agent.log import LOGGER
from agent.utils import write_to_stream
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

# Configuration
ACTIVITY_DB_CONN_STRING = os.getenv("ACTIVITY_DB_CONN_STRING")


# State Definition
class QueryAgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    input_query: Optional[str]
    user_id: Optional[str]
    sql_query: Optional[List[str]]
    sql_result: Optional[List[str]]
    error: Optional[str]
    retry_count: Optional[int]  # Track retry attempts


schema_description = """
    # FITNESS ACTIVITY DATABASE VIEWS - LLM-OPTIMIZED SCHEMA

    This database provides comprehensive views for querying fitness activity data from multiple sources (FIT files, Strava, etc.).
    All views are optimized for Large Language Model queries with user-friendly units and pre-calculated metrics.

    ## MAIN VIEWS AVAILABLE

    ### 1. public.session_details
    **Primary view for individual training sessions - the core unit of analysis**

    **Key Fields:**
    - session_id (UUID), user_id (UUID)
    - sport, sub_sport (e.g., 'cycling', 'mountain_biking')
    - session_date, session_year, session_month, session_hour
    - distance_km, elapsed_time_min, moving_time_min
    - avg_hr_bpm, max_hr_bpm, calories
    - avg_speed_kmh, max_speed_kmh, avg_cadence_rpm
    - avg_pace_min_per_km (for running/walking sports)
    - elevation_gain_m
    
    ### 2. public.record_summary
    **Detailed GPS and sensor data points**

    **Key Fields:**
    - record_id, session_id, timestamp
    - seconds_from_session_start
    - latitude, longitude, altitude_m
    - hr_bpm, speed_kmh, power_watts
    - cumulative_distance_km, sport

    ### 3. public.sport_statistics
    **Statistics broken down by sport type**

    **Key Fields:**
    - user_id, sport, session_count, total_distance_km
    - avg_distance_per_session_km, total_elapsed_time_h
    - avg_heart_rate_bpm, avg_speed_kmh, total_calories

    ### 4. public.monthly_activity_summary
    **Monthly aggregations for trend analysis**

    **Key Fields:**
    - user_id, year, month, year_month, month_year_name
    - activity_count, total_distance_km, total_elapsed_time_h

    ### 5. public.workouts
    **Structured workout definitions and training plans**

    **Key Fields:**
    - id (UUID), user_id (UUID)
    - name (workout title), description (workout purpose)
    - sport (e.g., 'Cycling', 'Running', 'Swimming', 'Strength', 'Yoga')
    - workout_text (structured workout content with intervals, zones, durations)
    - workout_minutes (estimated duration in minutes)
    - is_public (boolean - whether workout is shared publicly)
    - created_at, updated_at

    **Workout Text Format:** Structured text containing:
    - Sport type (first line)
    - Workout name/title (second line)
    - Warm-up, main sets, cool-down sections
    - Duration formats: 10m, 8m30s, 2h, 400m
    - Intensity zones: Z1-Z5, %FTP, %HR, Power watts
    - Comments with # symbol

    ### 7. public.workouts_scheduled
    **Planned workouts scheduled for specific dates and times**

    **Key Fields:**
    - id (UUID), user_id (UUID), workout_id (UUID - references workouts table)
    - scheduled_time (timestamp - when workout is planned)
    - status (e.g., 'scheduled', 'completed', 'skipped')
    - notes (optional user notes)
    - created_at, updated_at

    **Relationships:**
    - Each scheduled workout references a workout definition
    - Users can schedule the same workout multiple times
    - Scheduled workouts can be modified without affecting the original workout definition

    ## COMMON QUERY PATTERNS

    **Session Overview (Primary queries):**
    ```sql
    SELECT * FROM session_details WHERE session_year = 2024 ORDER BY session_date DESC;
    ```

    **Sport-specific Analysis:**
    ```sql
    SELECT * FROM session_details WHERE sport = 'cycling' AND session_year = 2024;
    ```

    **Performance Trends:**
    ```sql
    SELECT month_year_name, total_distance_km FROM monthly_activity_summary 
    WHERE user_id = 'user-uuid' ORDER BY year, month;
    ```

    **Recent Sessions:**
    ```sql
    SELECT * FROM session_details WHERE session_date >= CURRENT_DATE - INTERVAL '30 days';
    ```

    **Heart Rate Analysis:**
    ```sql
    SELECT sport, AVG(avg_hr_bpm) as avg_heart_rate FROM session_details 
    WHERE avg_hr_bpm IS NOT NULL GROUP BY sport;
    ```

    **Distance Totals by Sport:**
    ```sql
    SELECT sport, SUM(total_distance_km) as total_km FROM sport_statistics GROUP BY sport;
    ```

    **Upcoming Scheduled Workouts:**
    ```sql
    SELECT ws.scheduled_time, w.name, w.sport, w.workout_minutes
    FROM workouts_scheduled ws
    JOIN workouts w ON ws.workout_id = w.id
    WHERE ws.scheduled_time >= NOW()
    ORDER BY ws.scheduled_time;
    ```

    **Workout Library by Sport:**
    ```sql
    SELECT name, sport, workout_minutes, created_at
    FROM workouts
    WHERE sport = 'Cycling'
    ORDER BY created_at DESC;
    ```

    **Weekly Training Schedule:**
    ```sql
    SELECT DATE(scheduled_time) as workout_date, COUNT(*) as workouts_count,
           SUM(w.workout_minutes) as total_minutes
    FROM workouts_scheduled ws
    JOIN workouts w ON ws.workout_id = w.id
    WHERE ws.scheduled_time >= DATE_TRUNC('week', NOW())
    GROUP BY DATE(scheduled_time)
    ORDER BY workout_date;
    ```

    **Workout Content Search:**
    ```sql
    SELECT name, sport, workout_text
    FROM workouts
    WHERE workout_text ILIKE '%interval%' OR workout_text ILIKE '%Z5%';
    ```


    ## KEY FEATURES FOR LLM USE

    - **Session-centric approach**: Focus on individual training sessions as the main unit
    - **User-friendly units**: km instead of meters, minutes instead of seconds
    - **Pre-calculated metrics**: pace, speed conversions, time formatting
    - **Date components**: separate year, month, day fields for easy filtering
    - **Aggregated data**: totals and averages pre-computed
    - **Sport categorization**: consistent sport naming across sources
    - **NULL handling**: graceful handling of missing sensor data
    - **Row Level Security**: automatic filtering to user's own data
    - **Workout planning**: structured workout definitions and scheduling system
    - **Training analysis**: combine actual sessions with planned workouts for compliance tracking

    ## IMPORTANT NOTES

    - **Primary focus on sessions**: Use session_details as the main view for most queries
    - **Workout data**: Use workouts table for workout definitions, workouts_scheduled for planned sessions
    - All distances in kilometers (km), times in seconds or minutes as indicated
    - Pace calculations only available for running/walking/hiking sports
    - Power data mainly available for cycling activities
    - Heart rate data may be NULL if not recorded
    - GPS data (lat/lng) available in record_summary view
    - **Workout scheduling**: JOIN workouts_scheduled with workouts to get full workout details
    - **Training compliance**: Compare scheduled_time in workouts_scheduled with session_date in session_details
    - **Workout intensity**: Look for Z1-Z5, %FTP, %HR patterns in workout_text field
    """


async def node_generate_sql_query(
    state: QueryAgentState, config: RunnableConfig
) -> dict:
    """Generate SQL query from natural language input.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata for tracing
    """
    LOGGER.info("🚀 Starting node_generate_sql_query")

    query = state.get("input_query", "")
    retry_count = state.get("retry_count", 0)

    if not query:
        error_msg = "No input query provided"
        LOGGER.error(error_msg)
        return {"error": error_msg, "sql_query": [], "retry_count": retry_count}

    write_to_stream({"type": "status", "content": "Looking into your data..."})

    system_prompt = f"""You are an agent designed to interact with a SQL database.
    Given an input question, create a syntactically correct PostgreSQL query to run.
    Always limit your query to at most 100 results unless user specifies otherwise.

    Database Schema:
    {schema_description}

    Return only the SQL query, nothing else."""

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("human", f"Create a SQL query for this question: {query}"),
        ]
    )

    llm = get_llm("google/gemini-2.5-flash")
    sql_generation_chain = prompt | llm

    try:
        response = await sql_generation_chain.ainvoke(
            {"user_question": query}, config=config
        )
        sql_query = response.content.strip()

        # Clean SQL query
        if sql_query.startswith("```sql"):
            sql_query = sql_query[6:]
        if sql_query.endswith("```"):
            sql_query = sql_query[:-3]
        sql_query = sql_query.strip()

        LOGGER.info("✅ Completed node_generate_sql_query - SQL query generated")
        return {
            "sql_query": [sql_query],
            "error": None,
            "retry_count": retry_count,
        }

    except Exception as e:
        # Handle error internally - don't expose to user
        agent_error = handle_error(
            e, context="generating SQL query", user_id=state.get("user_id")
        )
        return {
            "sql_query": [],
            "error": agent_error.internal_message,
            "retry_count": retry_count,
        }


async def node_retry_sql_generation(
    state: QueryAgentState, config: RunnableConfig
) -> dict:
    """Regenerate SQL query with error context for retry.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata for tracing
    """
    LOGGER.info("🚀 Starting node_retry_sql_generation")

    query = state.get("input_query", "")
    retry_count = state.get("retry_count", 0)
    previous_error = state.get("error", "")
    previous_query = state.get("sql_query", [""])[-1] if state.get("sql_query") else ""

    new_retry_count = retry_count + 1

    system_prompt = f"""You are an agent designed to interact with a SQL database.
    You previously generated a SQL query that failed. Please fix the query based on the error.
    
    Database Schema:
    {schema_description}
    
    Previous failed query: {previous_query}
    Error: {previous_error}
    
    Create a corrected SQL query that addresses the error. Return only the SQL query, nothing else."""

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("human", f"Fix the SQL query for this question: {query}"),
        ]
    )

    llm = get_llm("google/gemini-2.5-flash")
    sql_generation_chain = prompt | llm

    try:
        response = await sql_generation_chain.ainvoke(
            {"user_question": query}, config=config
        )
        sql_query = response.content.strip()

        # Clean SQL query
        if sql_query.startswith("```sql"):
            sql_query = sql_query[6:]
        if sql_query.endswith("```"):
            sql_query = sql_query[:-3]
        sql_query = sql_query.strip()

        LOGGER.info("✅ Completed node_retry_sql_generation - SQL query regenerated")
        return {
            "sql_query": state.get("sql_query", []) + [sql_query],
            "error": None,
            "retry_count": new_retry_count,
        }

    except Exception as e:
        # Handle error internally - don't expose to user
        agent_error = handle_error(
            e, context="regenerating SQL query", user_id=state.get("user_id")
        )
        return {
            "sql_query": state.get("sql_query", []),
            "error": agent_error.internal_message,
            "retry_count": new_retry_count,
        }


async def node_execute_sql_query(state: QueryAgentState) -> dict:
    """Execute the SQL query against the activity PostgreSQL database."""
    LOGGER.info("🚀 Starting node_execute_sql_query")

    sql_query = state.get("sql_query", [""])[-1] if state.get("sql_query") else ""
    user_id = state.get("user_id")

    if not sql_query:
        error_msg = "No SQL query provided to execute"
        LOGGER.error(error_msg)
        return {
            "sql_result": [],
            "error": error_msg,
        }

    if not user_id:
        error_msg = "No user_id provided - cannot enforce Row Level Security"
        LOGGER.error(error_msg)
        return {
            "sql_result": [],
            "error": error_msg,
        }

    try:
        # Check if the query is a SELECT statement
        if sql_query.strip().upper().startswith(("SELECT", "WITH")):
            conn = psycopg2.connect(ACTIVITY_DB_CONN_STRING)
            cursor = conn.cursor()

            # Set PostgreSQL session context for Row Level Security
            # This ensures the query only returns data for the authenticated user
            cursor.execute("SET LOCAL role authenticated")
            cursor.execute(f"SET request.jwt.claim.sub = '{user_id}'")

            cursor.execute(sql_query)
            column_names = [desc[0] for desc in cursor.description]
            results = [dict(zip(column_names, row)) for row in cursor.fetchall()]

            # Limit results for performance
            MAX_RESULTS = 50
            if len(results) > MAX_RESULTS:
                sql_result_str = (
                    f"Query returned {len(results)} results. Showing first {MAX_RESULTS}:\n"
                    + "\n".join(map(str, results[:MAX_RESULTS]))
                )
            else:
                sql_result_str = (
                    "\n".join(map(str, results)) if results else "No results found."
                )

            LOGGER.info(f"SQL Result: {len(results)} rows returned")
            cursor.close()
            conn.close()

            return {
                "sql_result": [sql_result_str],
                "error": None,
            }
        else:
            error_msg = "Only SELECT queries are allowed"
            LOGGER.error(error_msg)
            return {
                "sql_result": [],
                "error": error_msg,
            }

    except psycopg2.Error as e:
        error_message = f"Database error: {str(e)}"
        if hasattr(e, "pgerror") and e.pgerror:
            error_message += f" ({e.pgerror.strip()})"
        LOGGER.error(error_message)
        return {
            "sql_result": [],
            "error": error_message,
        }
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        LOGGER.error(error_msg)
        return {
            "sql_result": [],
            "error": error_msg,
        }


async def node_format_final_response(state: QueryAgentState) -> dict:
    """
    Returns the raw SQL results without formatting.
    Outputs the final result with write_to_stream.
    """
    LOGGER.info("🚀 Starting node_format_final_response")

    sql_result = state.get("sql_result", [""])[-1] if state.get("sql_result") else ""
    error = state.get("error")

    if error:
        # Log the error internally but show a friendly message to user
        LOGGER.error(f"Query processing error: {error}")
        user_friendly_message = (
            "I couldn't retrieve that data. Could you rephrase your question?"
        )
        write_to_stream({"type": "tool_result", "content": user_friendly_message})
        return {
            "messages": state.get("messages", [])
            + [AIMessage(content=user_friendly_message)]
        }

    # Output the raw SQL result without formatting
    write_to_stream({"type": "tool_result", "content": sql_result})

    LOGGER.info("✅ Completed node_format_final_response - Raw result sent")
    return {"messages": state.get("messages", []) + [AIMessage(content=sql_result)]}


def should_retry_query(state: QueryAgentState) -> str:
    """Decide whether to retry query generation based on error and retry count."""
    error = state.get("error")
    retry_count = state.get("retry_count", 0)

    # If no error, proceed to format response
    if not error:
        return "format_response"

    # If we've reached max retries (5), give up and format the error
    if retry_count >= 5:
        LOGGER.warning(f"Max retries (5) reached for query generation. Error: {error}")
        return "format_response"

    # If there's an error and we haven't reached max retries, retry
    LOGGER.info(f"Query failed (attempt {retry_count + 1}/5), retrying...")
    return "retry_sql"


# Build the complete workflow
workflow = StateGraph(QueryAgentState)

# Add all nodes
workflow.add_node("generate_sql", node_generate_sql_query)
workflow.add_node("retry_sql", node_retry_sql_generation)
workflow.add_node("execute_sql", node_execute_sql_query)
workflow.add_node("format_response", node_format_final_response)

# Set entry point
workflow.set_entry_point("generate_sql")

# Add edges
workflow.add_edge("generate_sql", "execute_sql")
workflow.add_edge("retry_sql", "execute_sql")

# Add conditional edge from execute_sql based on whether we should retry
workflow.add_conditional_edges(
    "execute_sql",
    should_retry_query,
    {"retry_sql": "retry_sql", "format_response": "format_response"},
)

workflow.add_edge("format_response", END)

# Compile the graph
graph = workflow.compile()


async def astream_query_agent(input_query, user_id, thread_id):
    """Run the agent workflow in streaming mode."""
    LOGGER.info(
        f"🚀 Starting astream workflow for user_id: {user_id}, thread_id: {thread_id}"
    )

    initial_state: QueryAgentState = {
        "input_query": input_query,
        "user_id": user_id,
        "messages": [HumanMessage(content=input_query)],
        "sql_query": None,
        "sql_result": None,
        "error": None,
        "retry_count": 0,  # Initialize retry count
    }

    config = RunnableConfig(
        configurable={
            "recursion_limit": 20,
        }
    )

    async for event in graph.astream(
        initial_state, config=config, stream_mode="custom"
    ):
        yield event


async def main():
    """Main function for testing the query agent."""
    test_user_id = "2e04d74c-3d0b-45bc-83a0-bbdd8640b6a5"
    thread_id = str(uuid4())

    while True:
        user_input = input("\nYour question (or 'q' to quit): ")
        if user_input.lower() == "q":
            break
        else:
            async for event in astream_query_agent(user_input, test_user_id, thread_id):
                LOGGER.info(f"Query Agent Event: {event}")


if __name__ == "__main__":
    # python3 -m agent.query_agent
    import asyncio

    asyncio.run(main())
