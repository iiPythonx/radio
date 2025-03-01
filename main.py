# Copyright (c) 2025 iiPython
# A next-generation web radio setup.

# Modules
import time
import random
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from pydub import AudioSegment
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

# Constants
MUSIC_LOCATION = Path("/home/benjamin/Downloads/Lofi")

# Handle streaming
async def send_current(app: FastAPI, client: WebSocket) -> None:
    await client.send_json(app.state.current_song | {"position": round(time.time()) - app.state.start})

async def stream_task(app: FastAPI) -> None:
    last_song = None
    while True:
        current_song = random.choice([file for file in MUSIC_LOCATION.iterdir() if file.suffix in [".mp3", ".flac", ".wav"]])
        if current_song == last_song:
            continue

        last_song = current_song

        audio = AudioSegment.from_file(current_song)
        app.state.start = round(time.time())
        app.state.current_song = {
            "file": str(current_song.relative_to(MUSIC_LOCATION)),
            "name": current_song.with_suffix("").name,
            "length": audio.duration_seconds
        }

        print("Now playing:", current_song.name)
        for client in app.state.clients:
            await client.send_json({"type": "update", "data": app.state.current_song})

        for _ in range(round(audio.duration_seconds)):
            for client in app.state.clients:
                await client.send_json({"type": "clock", "data": {"time": round(time.time()) - app.state.start}})

            await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(stream_task(app))
    yield

# Initialization
app = FastAPI(openapi_url = None, lifespan = lifespan)
app.mount("/audio", StaticFiles(directory = MUSIC_LOCATION))

app.state.clients = set()
app.state.start = 0
app.state.current_song = None

# Handle connection socket
@app.websocket("/stream")
async def stream_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    app.state.clients.add(websocket)
    try:
        await websocket.send_json({"type": "update", "data": app.state.current_song})
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        app.state.clients.remove(websocket)

# Handle frontend
app.mount("/", StaticFiles(directory = Path("frontend"), html = True))
