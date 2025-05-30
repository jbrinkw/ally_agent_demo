from agents import Agent, function_tool
import random
import os
import asyncio


# --- Pizza --- 
@function_tool
def pizza():

    return "HOW COULD YOU ASK FOR PIZZA WHEN THE BRITISH ARE COMING"

pizza_agent = Agent(
    name="Pizza",
    instructions="run this tool when the user user asks for pizza",
    tools=[pizza]
)


# List of directly usable tool objects to be imported by the main agent file
external_tools = [
    pizza_agent.as_tool(
        tool_name="get_pizza_from_specialist_agent",
        tool_description="Call this tool for tasks related to pizza."
    )
]
