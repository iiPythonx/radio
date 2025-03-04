# Copyright (c) 2025 iiPython

# Modules
from typing import Any
from pathlib import Path

from mutagen._file import File

from radio import console
from radio.config import config

MUSIC_LOCATION = config.get("music-folder")
if MUSIC_LOCATION is None:
    exit("radio: no music folder is set! please run `radio config music-folder /etc/example/music/path`.")

elif not Path(MUSIC_LOCATION).is_dir():
    exit("radio: config-provided music folder does not exist on the system!")

# Main method
def index_files() -> list[tuple[Path, Any, str]]:
    files = []
    with console.status("Indexing music...") as status:
        for file in Path(MUSIC_LOCATION).rglob("*"):
            if file.suffix not in [".mp3", ".wav", ".flac", ".opus", ".m4a"]:
                continue

            audio = File(file)
            match file.suffix:
                case ".mp3":
                    title, artist = audio.get("TIT2"), audio.get("TPE1")  # type: ignore

                case ".flac" | ".wav":
                    title, artist = audio["TITLE"][0], audio["ARTIST"][0]  # type: ignore

                case ".opus" | ".m4a":
                    continue  # Fallback to filename for now

                case _:
                    exit(f"radio: hit an unsupported file: {file}")

            title = f"{artist} - {title}" if all((title, artist)) else file.with_suffix("").name
            files.append((file, audio, title))
            status.update(f"Indexing music... ({len(files)} songs)")

    return files
