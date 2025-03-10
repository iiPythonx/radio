# Copyright (c) 2025 iiPython

# Modules
import json
import typing
from pathlib import Path

# Handle capped ints
class NotInRange(Exception):
    pass

def capped_int(value: int, min: int, max: int) -> int:
    if not (min <= value <= max):
        raise NotInRange(f"This configuration value has a range of {min}-{max}!")

    return value

# Main class
class Configuration:
    def __init__(self) -> None:
        self._file = Path.home() / ".config/iipython-radio/config.json"
        self._file.parent.mkdir(parents = True, exist_ok = True)

        self._data = {}
        if self._file.is_file():
            self._data = json.loads(self._file.read_text())

        self.supported_keys = {
            "music-folder": str,
            "admin-password": str,
            "vote-ratio": lambda _: capped_int(int(_), 1, 100),
            "buffer-size": lambda _: capped_int(int(_), 0, 100_000)
        }

    def propagate(self) -> None:
        self._file.write_text(json.dumps(self._data))

    def get(self, key: str) -> typing.Any:
        return self._data.get(key)

    def set(self, key: str, value: typing.Any) -> None:
        if key not in self.supported_keys:
            raise KeyError

        self._data[key] = self.supported_keys[key](value)
        self.propagate()

config = Configuration()
