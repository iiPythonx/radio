# Copyright (c) 2025 iiPython

# Modules
import json
import typing
from pathlib import Path

# Main class
class Configuration:
    def __init__(self) -> None:
        self._file = Path.home() / ".config/iipython-radio/config.json"
        self._file.parent.mkdir(parents = True, exist_ok = True)

        self._data = {}
        if self._file.is_file():
            self._data = json.loads(self._file.read_text())

        self.supported_keys = ["music-folder", "admin-key"]

    def propagate(self) -> None:
        self._file.write_text(json.dumps(self._data))

    def get(self, key: str) -> typing.Any:
        return self._data.get(key)

    def set(self, key: str, value: str) -> None:
        self._data[key] = value
        self.propagate()

config = Configuration()
