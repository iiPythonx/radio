# Copyright (c) 2025 iiPython
# A next-generation web radio setup.

# Modules
import time
import json
import random
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

import il
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from radio import console
from radio.config import config
from radio.indexing import LoadIssue, UnsupportedFile, load_file, index_files, Track, MUSIC_LOCATION

# Handle streaming
class Client:
    def __init__(self, websocket: WebSocket, ip: str) -> None:
        self.ws, self.ip, self.voted, self.admin = websocket, ip, False, False
        self.send_json = websocket.send_json

class Overrides:
    track: Track | None = None
    ratio: int          = 50
    skip:  bool         = False

    def reset(self) -> None:
        self.track, self.skip = None, False

class AppState:
    def __init__(self) -> None:
        self.current_track: dict | None = None
        self.overrides = Overrides()

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
        self.clients: set[Client] = set()

    async def loop(self) -> None:
        track, last_track = None, None
        while True:
            if track != last_track and track:
                (path, audio, name) = track
                if not self.overrides.track:
                    last_track = track

                self.overrides.reset()

                # Calculate new data
                self.current_track = {"file": str(path.relative_to(MUSIC_LOCATION)), "name": name, "length": audio.info.length}

                # Log to console
                il.create_log(f"\033[33m\u26A1 New Song [{name}]")
                il.create_log(f"\033[90m   │   \033[90m{path}")
                il.create_log(f"\033[90m   └→  \033[90mNow Playing\t\033[33m[{audio.info.length:.1f} second(s)]\033[0m")

                # Send track update
                for client in self.clients:
                    await client.send_json({"type": "update", "data": self.current_track})

                def generate_status(elapsed: int, clients: int, votes: int) -> str:
                    return f"Next song in {round(audio.info.length - (elapsed / 1000))} second(s). Clients: {clients}; Skip votes: {votes}"

                with console.status(generate_status(0, 0, 0)) as status:
                    duration = round(audio.info.length)
                    for elapsed in range(duration):
                        if elapsed == duration - 5:
                            track = self.overrides.track or random.choice(self.tracks)
                            for client in self.clients:
                                await client.send_json({"type": "preload", "data": {"file": str(track[0].relative_to(MUSIC_LOCATION))}})

                        client_count = len(set(client.ip for client in self.clients))
                        vote_count = len([client for client in self.clients if client.voted])

                        # Send heartbeat
                        if (self.clients and (vote_count >= client_count * (self.overrides.ratio / 100))) or self.overrides.skip:
                            for client in self.clients:
                                client.voted = False

                            break

                        clock = round(time.time() * 1000)
                        for client in self.clients:
                            await client.send_json({"type": "heartbeat", "data": {
                                "time": elapsed, "users": client_count, "votes": vote_count,
                                "vote_ratio": self.overrides.ratio, "clock": clock
                            }})

                        await asyncio.sleep(1)
                        status.update(generate_status(elapsed, client_count, vote_count))

            if last_track == track:
                track = self.overrides.track or random.choice(self.tracks)

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
    if next(filter(lambda client: client.ip == ip, radio.clients), None):
        enable_voting = False

    client = Client(websocket, ip)
    radio.clients.add(client)

    # Handle lifecycle
    try:
        await websocket.send_json({"type": "update", "data": radio.current_track})
        while True:
            response = await websocket.receive_json()
            match response:
                case {"type": "voteskip"} if enable_voting:
                    client.voted = not client.voted

                case {"type": "admin", "data": data}:
                    match data:
                        case {"command": "connect", "password": password}:
                            client.admin = password == config.get("admin-password")
                            await websocket.send_json({
                                "type": "admin",
                                "data": {
                                    "success": client.admin,
                                    "vote_ratio": radio.overrides.ratio
                                }
                            })

                        case {"command": "set-ratio", "ratio": ratio} if client.admin:
                            radio.overrides.ratio = ratio

                        case {"command": "force-play", "file": file} if client.admin:
                            try:
                                radio.overrides.track = load_file(Path(file).expanduser())
                                radio.overrides.skip = True

                            except LoadIssue:
                                await websocket.send_json({
                                    "type": "admin",
                                    "data": { "message": "Failed to load specified file, does it exist?" }
                                })

                            except UnsupportedFile:
                                await websocket.send_json({
                                    "type": "admin",
                                    "data": { "message": "Specified file type is unsupported." }
                                })

                        case {"command": "force-skip"} if client.admin:
                            radio.overrides.skip = True

    except json.JSONDecodeError:
        await websocket.send_json({"type": "issue", "data": "Your client did not send proper JSON, please check your encoding and reconnect."})
        await websocket.close()

    except WebSocketDisconnect:
        pass

    radio.clients.remove(client)

# Handle frontend
app.mount("/", StaticFiles(directory = Path(__file__).parent / "frontend", html = True))
