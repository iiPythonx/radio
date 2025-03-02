__version__ = "0.1.0"

import logging
from rich.console import Console

for log in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(log).disabled = True

console = Console()
