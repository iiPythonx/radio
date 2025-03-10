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
@click.argument("key", required = False)
@click.argument("value", required = False)
def config(key: typing.Optional[str] = None, value: typing.Optional[str] = None) -> None:
    """Configure an option via CLI."""

    from radio.config import config
    if key is None:
        print("\033[90m|  Live configuration:")
        for _k, _v in config._data.items():
            print(f"|    {_k}: {_v}")

        return print("└→ Available:", ", ".join(config.supported_keys))

    if key not in config.supported_keys:
        click.secho("×  Invalid configuration option!", fg = "red")
        return click.secho(f"└→ Available: {', '.join(config.supported_keys)}", fg = "red")

    if value is not None:
        try:
            config.set(key, value)
        
        except Exception as e:
            return click.secho(f"× {e}", fg = "red")

        return click.secho("✓ Configuration updated!", fg = "green")

    value = config.get(key)
    if value:
        return print(value)

    click.secho("× Specified key hasn't been set yet!", fg = "red")

if __name__ == "__main__":
    radio()
