# Copyright (c) 2025 iiPython

# Modules
import click
import typing

# Setup commands
@click.group(epilog = "Copyright (c) 2025 iiPython")
def radio() -> None:
    """A next-generation web radio.

    \b
    Demo site     : https://radio.iipython.dev
    Source code   : https://github.com/iiPythonx/radio
    """
    return

@radio.command()
@click.argument("host", type = str)
@click.argument("port", type = int)
@click.option("--debug", is_flag = True, default = False, help = "Enable debug logging.")
def serve(host: str, port: int, debug: bool) -> None:
    """Serve the web radio using uvicorn."""

    import uvicorn
    from radio.app import app

    uvicorn.run(
        app,
        host = host,
        port = port,
        log_level = "info" if debug else "critical"
    )

@radio.command()
@click.argument("key")
@click.argument("value", required = False)
def config(key: str, value: typing.Optional[str] = None) -> None:
    """Configure an option via CLI."""

    from radio.config import config
    if key not in config.supported_keys:
        click.secho("×  Invalid configuration option!", fg = "red")
        return print("\033[90m└→ Available:", ", ".join(config.supported_keys), "\033[0m")

    if value is not None:
        config.set(key, value)
        return click.secho("✓ Configuration updated!", fg = "green")

    value = config.get(key)
    if value:
        return print(value)

    click.secho("× Specified key hasn't been set yet!", fg = "red")

if __name__ == "__main__":
    radio()
