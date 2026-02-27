"""FastAPI server with WebSocket endpoint for Gemini Live bidi-streaming."""

import json
import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from extended_play.live_session import LiveSession


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    yield


app = FastAPI(title="Extended Play Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "extended-play-agent"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    async def send_to_client(message: str):
        try:
            await ws.send_text(message)
        except Exception:
            pass

    session = LiveSession(send_to_client)

    try:
        await session.start()

        # Start the receive loop in the background
        receive_task = asyncio.create_task(session.receive_loop())

        # Read from browser WebSocket and forward to Gemini
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg["type"] == "audio":
                await session.send_audio(msg["data"])
            elif msg["type"] == "stop":
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        await session.close()
        if "receive_task" in locals():
            receive_task.cancel()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
