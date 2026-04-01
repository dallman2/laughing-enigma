#!/usr/bin/env python3
"""Download pre-trained AdaIN weights from naoto0804/pytorch-AdaIN."""

from pathlib import Path
import urllib.request
import sys

WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights"

FILES = {
    "decoder.pth": "https://github.com/naoto0804/pytorch-AdaIN/releases/download/v0.0.0/decoder.pth",
    "vgg_normalised.pth": "https://github.com/naoto0804/pytorch-AdaIN/releases/download/v0.0.0/vgg_normalised.pth",
}


def download(name: str, url: str) -> None:
    dest = WEIGHTS_DIR / name
    if dest.exists():
        print(f"  {name} already exists ({dest.stat().st_size / 1e6:.1f} MB), skipping")
        return

    print(f"  Downloading {name}...")
    urllib.request.urlretrieve(url, dest)
    print(f"  Saved {name} ({dest.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading AdaIN weights to {WEIGHTS_DIR}/")

    for name, url in FILES.items():
        try:
            download(name, url)
        except Exception as e:
            print(f"  ERROR downloading {name}: {e}", file=sys.stderr)
            sys.exit(1)

    print("Done.")


if __name__ == "__main__":
    main()
