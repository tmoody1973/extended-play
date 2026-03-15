"""Scene illustration generator using Gemini image generation."""

import base64
import os
from google import genai


async def generate_scene_image(
    artists: str,
    era: str = "",
    genre: str = "",
    mood: str = "",
    context: str = "",
) -> dict:
    """Generate a stylized illustration for a music story scene.

    Args:
        artists: Artist names relevant to the scene.
        era: Time period (e.g., "1970s Lagos", "2020s London").
        genre: Musical genre context.
        mood: Visual mood (e.g., "warm", "electric", "contemplative").
        context: Narrative context for the illustration.

    Returns:
        dict with status, imageData (base64), mimeType, and caption.
    """
    prompt = (
        f"Create a stylized editorial illustration in a vintage concert poster aesthetic. "
        f"Warm tones, muted gold and walnut palette, textured paper feel. "
        f"Scene: {context or f'{artists} in the {era} {genre} scene'}. "
        f"Mood: {mood or 'warm and evocative'}. "
        f"Style: Screen-printed gig poster, no text, no words, no letters. "
        f"Artists referenced (for visual inspiration only): {artists}."
    )

    try:
        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "False").lower() == "true"
        if use_vertex:
            client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
        else:
            client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

        response = await client.aio.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        # Extract image from response
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                image_b64 = base64.b64encode(part.inline_data.data).decode()
                caption = context or f"{artists} — {era} {genre}"
                return {
                    "status": "success",
                    "imageData": image_b64,
                    "mimeType": part.inline_data.mime_type,
                    "caption": caption,
                }

        return {"status": "error", "message": "No image generated in response"}

    except Exception as e:
        return {"status": "error", "message": str(e)}
