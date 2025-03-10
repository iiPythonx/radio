# Copyright (c) 2025 iiPython
# A next-generation web radio setup.

# Modules
import json
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from radio.config import config
from radio.indexing import (
    LoadIssue, UnsupportedFile, NotRelative,
    load_file, MUSIC_LOCATION
)
from radio.processor import radio, Client

# Handle background tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(radio.loop())
    yield

# Initialization
app = FastAPI(openapi_url = None, lifespan = lifespan)
app.mount("/audio", StaticFiles(directory = MUSIC_LOCATION))

# Handle tracklist
@app.get("/tracklist")
async def send_tracklist() -> JSONResponse:
    return radio.tracklist

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
        await radio.update()
        while True:
            response = await websocket.receive_json()
            match response:
                case {"type": "position"}:
                    await websocket.send_json({"type": "position", "data": {"elapsed": radio.time() - radio.start_time}})  # type: ignore

                case {"type": "voteskip"} if enable_voting:
                    client.voted = not client.voted
                    await radio.update()
                    await radio.process_votes()

                case {"type": "downvote"} if enable_voting:  # enable_voting is locked to one ip
                    radio.downvote(ip)

                case {"type": "admin", "data": data}:
                    match data:
                        case {"command": "connect", "password": password}:
                            client.admin = password == config.get("admin-password")
                            await websocket.send_json({
                                "type": "admin",
                                "data": {
                                    "success": client.admin,
                                    "vote_ratio": radio.config.ratio
                                }
                            })

                        case {"command": "set-ratio", "ratio": ratio} if client.admin:
                            radio.config.ratio = ratio
                            await radio.update()

                        case {"command": "force-play", "file": file} if client.admin:
                            try:
                                radio.queue[0] = load_file(Path(file).expanduser())
                                radio.skip()

                            except (LoadIssue, UnsupportedFile, NotRelative) as e:
                                await websocket.send_json({
                                    "type": "admin",
                                    "data": {
                                        "message": {
                                            LoadIssue: "Failed to load specified file, does it exist?",
                                            UnsupportedFile: "Specified file type is unsupported.",
                                            NotRelative: "Specified file is not relative to music location."
                                        }[type(e)]
                                    }
                                })

                        case {"command": "force-skip"} if client.admin:
                            radio.skip()

    except json.JSONDecodeError:
        await websocket.send_json({"type": "issue", "data": "Your client did not send proper JSON, please check your encoding and reconnect."})
        await websocket.close()

    except WebSocketDisconnect:
        pass

    radio.clients.remove(client)

# Handle frontend
app.mount("/", StaticFiles(directory = Path(__file__).parent / "frontend", html = True))
