# Copyright (c) 2025 iiPython

import time
import random
import asyncio

from fastapi import WebSocket

from radio.config import config
from radio.indexing import index_files, Track

class IndexState:
    LOADING = 1
    OK      = 2

class ProcessorConfig:
    ratio: int = config.get("vote-ratio") or 50
    buffer_size: int = config.get("buffer-size") or 10

class Client:
    def __init__(self, websocket: WebSocket, ip: str) -> None:
        self.ws, self.ip, self.voted, self.admin = websocket, ip, False, False
        self.send_json = websocket.send_json

class RadioProcessor:
    def __init__(self) -> None:
        self.start_time: int | None = None
        self.current_track: Track | None = None

        self.config = ProcessorConfig()
        self.skip_event = asyncio.Event()

        self.queue: list[Track] = []
        self.track_buffer: list[Track] = []

        # Generate box
        print(f"\033[34m┌{'─' * 36}┐")
        print(f"│ Web Radio{' ' * 8}(c) 2025 iiPython │")
        print(f"└{'─' * 36}┘\033[0m")

        # Load index
        self.tracks: list[Track] = []
        self.encoded_tracks: list[dict[str, str | int]] = []

        self.load_index()

        print(f"\033[34m   {len(self.tracks)} song(s) indexed, good to go!")
        print("─" * 38, "\033[0m")

        # Handle unique data
        self.clients: set[Client] = set()

    @staticmethod
    def time() -> int:
        return int(time.time() * 1000)

    def skip(self) -> None:
        self.skip_event.set()

    def downvote(self, ip: str) -> None:
        if self.current_track is None:
            return  # The hell happened here?

        config.add_downvote(self.current_track.path, ip)

    def load_index(self) -> None:
        self.tracks = ([Track(**t) for t in config.get_index()] if not self.tracks else []) or index_files()
        self.encoded_tracks = [t.dict() for t in self.tracks]

        config.set_index(self.encoded_tracks)
        self.index_state = IndexState.OK

    async def update(self) -> None:
        if self.current_track is None:
            raise RuntimeError("update() was called but no track is currently running!")

        for client in self.clients:
            await client.send_json({
                "type": "update",
                "data": {
                    "user_count": len(set(c.ip for c in self.clients)),
                    "vote_count": len([c for c in self.clients if c.voted]),
                    "vote_ratio": self.config.ratio,
                    "next_track": self.queue[-1].path,
                    "this_track": self.current_track.dict()
                }
            })

    async def start_track(self, track: Track) -> None:
        self.current_track = track

        # Log to console
        print(f"\033[33m\u26A1 New Song [{track.title}]")
        print(f"\033[90m   │   \033[90m{track.path}")
        print(f"\033[90m   └→  \033[90mNow Playing\t\033[33m[{(track.length / 1000):.1f} second(s)]\033[0m")

        # Send track update
        self.start_time = self.time()

        await self.update()
        try:
            async with asyncio.timeout(track.length / 1000):
                await self.skip_event.wait()

        except TimeoutError:
            pass

        self.track_buffer = (self.track_buffer + [track])[-self.config.buffer_size:]

    async def loop(self) -> None:
        while True:
            self.skip_event.clear()
            while len(self.queue) != 2:
                self.queue.append(random.choice(self.tracks))
                if len(self.queue) == 2 and self.queue[-1] in self.track_buffer:
                    self.queue.pop()  # Select another track instead

            await self.start_track(self.queue.pop(0))

    async def process_votes(self) -> None:
        current_users = len(set(c.ip for c in self.clients))
        if len([c for c in self.clients if c.voted]) >= (current_users * (self.config.ratio / 100)):
            for client in self.clients:
                client.voted = False

            self.skip()

radio = RadioProcessor()
