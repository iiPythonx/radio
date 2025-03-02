# iiPythonx / webradio

A next generation web radio project.


### Environment

```sh
uv venv
source .venv/bin/activate
uv pip install -e .
```

`il` and `rich` are not *required*, and you can remove them from the codebase if you don't mind downgrading your log setup.

### Running

```sh
MUSICDIR=/mnt/music uvicorn main:app
```

Supported file extensions are `.flac`, `.mp3`, and `.wav`; the ID3/Vorbis tags will be used for the track title (if not present, falls back to filename).  
It's recommended to put instance specific information in `radio/frontend/NEWS.txt`.
