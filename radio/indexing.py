# Copyright (c) 2025 iiPython

# Modules
from pathlib import Path
from dataclasses import dataclass

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
@dataclass
class Track:
    relative_path: str
    title:         str
    length:        int

    def dict(self) -> dict:
        return {"path": self.relative_path, "title": self.title, "length": self.length}

class LoadIssue(Exception):
    pass

class UnsupportedFile(Exception):
    pass

class NotRelative(Exception):
    pass

# Main method
def load_file(path: Path) -> Track:
    if not path.is_file():
        raise LoadIssue

    if not path.is_relative_to(MUSIC_LOCATION):
        raise NotRelative

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
    return Track(
        str(path.relative_to(MUSIC_LOCATION)),
        title,
        int(audio.info.length * 1000)
    )

def index_files() -> list[Track]:
    files = []
    with console.status("Indexing music...") as status:
        for file in Path(MUSIC_LOCATION).rglob("*"):
            if file.suffix not in [".mp3", ".wav", ".flac", ".opus", ".m4a"]:
                continue

            files.append(load_file(file))
            status.update(f"Indexing music... ({len(files)} songs)")

    return files
