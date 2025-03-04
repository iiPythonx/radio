# Copyright (c) 2025 iiPython

# Modules
from typing import Any
from pathlib import Path

from mutagen._file import File

from radio import console
from radio.config import config

# Initialization
MUSIC_LOCATION = config.get("music-folder")
if MUSIC_LOCATION is None:
    exit("radio: no music folder is set! please run `radio config music-folder /etc/example/music/path`.")

elif not Path(MUSIC_LOCATION).is_dir():
    exit("radio: config-provided music folder does not exist on the system!")

# Typing and exceptions
type Track = tuple[Path, Any, str]

class LoadIssue(Exception):
    pass

class UnsupportedFile(Exception):
    pass

# Main method
def load_file(path: Path) -> Track:
    if not path.is_file():
        raise LoadIssue

    audio = File(path)
    if audio is None:
        raise LoadIssue

    match path.suffix:
        case ".mp3":
            title, artist = audio.get("TIT2"), audio.get("TPE1")  # type: ignore

        case ".flac" | ".wav":
            title, artist = audio["TITLE"][0], audio["ARTIST"][0]  # type: ignore

        case ".opus" | ".m4a":
            title, artist = None, None  # Fallback to filename for now

        case _:
            raise UnsupportedFile(path)

    title = f"{artist} - {title}" if all((title, artist)) else path.with_suffix("").name
    return (path, audio, title)

def index_files() -> list[Track]:
    files = []
    with console.status("Indexing music...") as status:
        for file in Path(MUSIC_LOCATION).rglob("*"):
            if file.suffix not in [".mp3", ".wav", ".flac", ".opus", ".m4a"]:
                continue

            files.append(load_file(file))
            status.update(f"Indexing music... ({len(files)} songs)")

    return files
