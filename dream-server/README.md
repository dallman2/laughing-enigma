# dream-server

Local GPU server for Dream Explorer — Deep Dream & Neural Style Transfer with PyTorch.

## Install

```bash
pip install -e .
```

## Run

```bash
dream-server
# Starts on http://localhost:8420
# Auto-detects MPS (Apple Silicon) / CUDA / CPU
```

## Test

```bash
pip install -e ".[test]"
pytest tests/ -v
```
