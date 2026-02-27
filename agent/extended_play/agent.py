from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION

root_agent = Agent(
    model="gemini-2.0-flash-live-001",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[],
)
