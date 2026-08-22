MIN_NICKNAME_LENGTH = 4
MAX_NICKNAME_LENGTH = 20


def normalize_nickname(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Ник должен быть строкой")
    nickname = value.strip()
    if not nickname:
        raise ValueError("Ник не может быть пустым")
    if len(nickname) < MIN_NICKNAME_LENGTH:
        raise ValueError(f"Ник должен содержать минимум {MIN_NICKNAME_LENGTH} символа")
    if len(nickname) > MAX_NICKNAME_LENGTH:
        raise ValueError(f"Ник не может быть длиннее {MAX_NICKNAME_LENGTH} символов")
    return nickname
