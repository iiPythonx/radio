# Copyright (c) 2025 iiPython

# Modules
import os
from typing import Any
from pathlib import Path

from mutagen._file import File

from radio import console

# Main method
MUSIC_LOCATION = Path(os.getenv("MUSICDIR") or (Path.cwd() / "music"))
if not MUSIC_LOCATION.is_dir():
    exit("radio: either $MUSICDIR wasn't provided, doesn't exist, or ./music doesn't exist!")

def index_files() -> list[tuple[Path, Any, str]]:
    files = []
    with console.status("Indexing music...") as status:
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
                    exit(f"radio: hit an unsupported file: {file}")

            title = f"{artist} - {title}" if all((title, artist)) else file.with_suffix("").name
            files.append((file, audio, title))
            status.update(f"Indexing music... ({len(files)} songs)")

    return files
