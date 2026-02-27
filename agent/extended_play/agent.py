from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION
from .tools.graph import explore_artist, get_connections, search_artists, get_bridge_artists

root_agent = Agent(
    model="gemini-2.0-flash-live-001",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        explore_artist,
        get_connections,
        search_artists,
        get_bridge_artists,
    ],
)
