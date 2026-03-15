from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION
from .tools.graph import explore_artist, get_connections, search_artists, get_bridge_artists
from .tools.episodes import list_episodes, get_episode
from .tools.reviews import search_reviews
from .tools.corpus import seed_artist_corpus
from .tools.playlists import create_playlist, add_to_playlist
from .tools.images import generate_scene_image
from .tools.storyteller import tell_story

root_agent = Agent(
    model="gemini-live-2.5-flash-native-audio",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        explore_artist,
        get_connections,
        search_artists,
        get_bridge_artists,
        list_episodes,
        get_episode,
        search_reviews,
        seed_artist_corpus,
        create_playlist,
        add_to_playlist,
        generate_scene_image,
        tell_story,
    ],
)
