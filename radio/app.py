# Copyright (c) 2025 iiPython
# A next-generation web radio setup.

# Modules
import time
import random
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

import il
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from radio import console
from radio.indexing import index_files, MUSIC_LOCATION

# Handle streaming
class AppState:
    def __init__(self) -> None:
        self.start_time: int | None = None
        self.current_track: dict | None = None

        # Generate box
        il.box(
            size = 38,
            left = "Web Radio",
            right = "(c) 2025 iiPython",
        )

        # Load tracks
        self.tracks = index_files()
        il.indent(f"{len(self.tracks)} song(s) indexed, good to go!", indent = 3)
        il.rule(38)

        # Handle unique data
        self.clients = []

    @staticmethod
    def time() -> int:
        return round(time.time())

    async def loop(self) -> None:
        last_track = None
        while True:
            (path, audio, name) = random.choice(self.tracks)
            if path == last_track:
                continue

            last_track = path

            # Calculate new data
            self.start_time = self.time()
            self.current_track = {"file": str(path.relative_to(MUSIC_LOCATION)), "name": name, "length": audio.info.length}

            # Log to console
            il.create_log(f"\033[33m\u26A1 New Song [{name}]")
            il.create_log(f"\033[90m   │   \033[90m{path}")
            il.create_log(f"\033[90m   └→  \033[90mNow Playing\t\033[33m[{audio.info.length:.1f} second(s)]\033[0m")

            # Send track update
            for client, _, _ in self.clients:
                await client.send_json({"type": "update", "data": self.current_track})

            def generate_status(elapsed: int, clients: int, votes: int) -> str:
                return f"Next song in {round(audio.info.length - elapsed)} second(s). Clients: {clients}; Skip votes: {votes}"

            with console.status(generate_status(0, 0, 0)) as status:
                for _ in range(round(audio.info.length)):
                    client_count = len(set(ip for _, ip, _ in self.clients))
                    vote_count = len([client for client, _, voted in self.clients if voted])

                    # Send heartbeat
                    elapsed = self.time() - self.start_time
                    for client, _, _ in self.clients:
                        await client.send_json({"type": "heartbeat", "data": {
                            "time": elapsed, "users": client_count, "votes": vote_count
                        }})

                    if self.clients and (vote_count >= client_count / 2):
                        for client in self.clients:
                            client[-1] = False

                        break

                    await asyncio.sleep(1)
                    status.update(generate_status(elapsed, client_count, vote_count))

# Handle background tasks
radio = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(radio.loop())
    yield

# Initialization
app = FastAPI(openapi_url = None, lifespan = lifespan)
app.mount("/audio", StaticFiles(directory = MUSIC_LOCATION))

# Handle connection socket
@app.websocket("/stream")
async def stream_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    # Push onto client stack
    ip, enable_voting = websocket.headers.get("CF-Connecting-IP", websocket.client.host), True  # type: ignore
    if next(filter(lambda x: x[1] == ip, radio.clients), None):
        enable_voting = False

    client = [websocket, ip, False]
    radio.clients.append(client)

    # Handle lifecycle
    try:
        await websocket.send_json({"type": "update", "data": radio.current_track})
        while True:
            if await websocket.receive_text() == "voteskip" and enable_voting:
                client[-1] = not client[-1]

    except WebSocketDisconnect:
        radio.clients.remove(client)

# Handle frontend
app.mount("/", StaticFiles(directory = Path(__file__).parent / "frontend", html = True))
