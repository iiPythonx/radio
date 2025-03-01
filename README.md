# iiPythonx / webradio

A next generation web radio project.


### Environment

```sh
uv venv
source .venv/bin/activate
uv pip install -e .
```

### Running

```sh
MUSICDIR=/mnt/music uvicorn main:app
```

Supported file extensions are `.flac`, `.mp3`, and `.wav`; the file name will be used as the song title.
