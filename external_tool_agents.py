from agents import Agent, function_tool
import random
import os


# --- File Reader Specialist --- 
@function_tool
def _read_test_data_file_content() -> str:
    """Reads the content of 'test_data.txt' from the current working directory and returns it."""
    file_path = "test_data.txt"
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return f"Error: The file '{file_path}' was not found."
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"

file_reader_specialist_agent = Agent(
    name="File Reader Specialist",
    instructions=(
        "You are a specialized file reader agent. Use the \'_read_test_data_file_content\' tool to read the contents of \'test_data.txt\'. Return the content obtained from the tool, or the error message if the tool provides one."
    ),
    tools=[_read_test_data_file_content]
)


# --- Random Number Specialist --- 
@function_tool
def _generate_actual_random_number() -> int:
    """Generates a random integer between 1 and 100 (inclusive)."""
    return random.randint(1, 100)

random_number_specialist_agent = Agent(
    name="Random Number Specialist",
    instructions=(
        "You are a specialized random number agent. Use the \'_generate_actual_random_number\' tool to get a random number. Then, return it in a string format like: \'Here\\'s a random number for you: [number]\'"
    ),
    tools=[_generate_actual_random_number]
)


# List of directly usable tool objects to be imported by the main agent file
external_tools = [
    file_reader_specialist_agent.as_tool(
        tool_name="get_file_reader_specialist_from_specialist_agent",
        tool_description="Call this tool for tasks related to file reader specialist."
    ),
    random_number_specialist_agent.as_tool(
        tool_name="get_random_number_specialist_from_specialist_agent",
        tool_description="Call this tool for tasks related to random number specialist."
    )
]
