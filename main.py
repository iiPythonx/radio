# Copyright (c) 2025 iiPython
# A next-generation web radio setup.

# Modules
import os
import time
import random
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from mutagen._file import File
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

# Constants
MUSIC_LOCATION = Path(os.getenv("MUSICDIR") or (Path.cwd() / "music"))

# Setup file indexing
FILES = []
print("\033[34mRADIO:\033[0m\tBeginning to index files...")
for file in MUSIC_LOCATION.rglob("*"):
    if file.suffix not in [".mp3", ".wav", ".flac"]:
        continue

    audio = File(file)
    match file.suffix:
        case ".mp3":
            title, artist = audio.get("TIT2"), audio.get("TPE1")  # type: ignore

        case ".flac" | ".wav":
            title, artist = audio["TITLE"][0], audio["ARTIST"][0]  # type: ignore

        case _:
            exit(f"Hit an unsupported file: {file}")

    title = f"{artist} - {title}" if all((title, artist)) else file.with_suffix("").name
    FILES.append((file, audio, title))

print(f"\033[34mRADIO:\033[0m\tIndex complete! {len(FILES)} song(s) present")

# Handle streaming
async def stream_task(app: FastAPI) -> None:
    last_song = None
    while True:
        (path, audio, title) = random.choice(FILES)
        if path == last_song:
            continue

        last_song = path

        app.state.start = round(time.time())
        app.state.current_song = {
            "file": str(path.relative_to(MUSIC_LOCATION)),
            "name": title,
            "length": audio.info.length
        }

        for client in app.state.clients:
            await client.send_json({"type": "update", "data": app.state.current_song})

        for _ in range(round(audio.info.length)):
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
