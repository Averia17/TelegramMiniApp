from threading import Lock

_lock = Lock()
_draining = False
_message = ""


def begin(message: str) -> bool:
    global _draining, _message
    with _lock:
        changed = not _draining
        _draining = True
        _message = message
        return changed


def resume() -> None:
    global _draining, _message
    with _lock:
        _draining = False
        _message = ""


def is_draining() -> bool:
    with _lock:
        return _draining


def snapshot() -> dict[str, object]:
    with _lock:
        return {"draining": _draining, "message": _message}
