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
print("\033[34mRADIO:\033[0m    Beginning to index files...")
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

print(f"\033[34mRADIO:\033[0m    Index complete! {len(FILES)} song(s) present")

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

        for client, _ in app.state.clients:
            await client.send_json({"type": "update", "data": app.state.current_song})

        for _ in range(round(audio.info.length)):
            client_count = len(set(ip for _, ip in app.state.clients))
            for client, _ in app.state.clients:
                await client.send_json({"type": "heartbeat", "data": {
                    "time": round(time.time()) - app.state.start, 
                    "users": client_count,
                    "votes": len(app.state.voters)
                }})

            if app.state.clients and (len(app.state.voters) >= client_count / 2):
                app.state.voters = set()
                break

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
app.state.voters = set()

# Handle connection socket
@app.websocket("/stream")
async def stream_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    # Push onto client stack
    ip, enable_voting = websocket.headers.get("CF-Connecting-IP", websocket.client.host), True  # type: ignore
    if next(filter(lambda x: x[1] == ip, app.state.clients), None):
        enable_voting = False

    app.state.clients.add((websocket, ip))

    # Handle lifecycle
    try:
        await websocket.send_json({"type": "update", "data": app.state.current_song})
        while True:
            if await websocket.receive_text() == "voteskip" and enable_voting:
                if websocket in app.state.voters:
                    app.state.voters.remove(websocket)

                else:
                    app.state.voters.add(websocket)

    except WebSocketDisconnect:
        app.state.clients.remove((websocket, ip))
        if websocket in app.state.voters:
            app.state.voters.remove(websocket)

# Handle frontend
app.mount("/", StaticFiles(directory = Path("frontend"), html = True))
