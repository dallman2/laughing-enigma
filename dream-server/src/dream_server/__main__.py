"""Entry point for `python -m dream_server` and `dream-server` CLI."""

import uvicorn


def main() -> None:
    uvicorn.run(
        "dream_server.server:app",
        host="0.0.0.0",
        port=8420,
        log_level="info",
    )


if __name__ == "__main__":
    main()
