from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, Literal, Optional

from pydantic import BaseModel, Field, PrivateAttr

GameState = Literal["waiting", "lobby", "game"]
GameMode = Literal["deathmatch", "team deathmatch"]
Team = Literal["Red", "Blue"]


class MessageJSON(BaseModel):
    type: str
    from_: str = Field(alias="from")
    ts: int
    params: Dict[str, Any]


class IGame(BaseModel):
    room_name: str
    map_name: str
    max_players: int
    mode: GameMode
    on_waiting_start: Callable[[Optional[MessageJSON]], None]
    on_lobby_start: Callable[[Optional[MessageJSON]], None]
    on_game_start: Callable[[Optional[MessageJSON]], None]
    on_game_end: Callable[[Optional[MessageJSON]], None]


class Constants:
    LOBBY_DURATION = 60_000
    GAME_DURATION = 600_000


class Game(BaseModel):
    state: GameState = "lobby"
    room_name: str
    map_name: str
    lobby_ends_at: Optional[int] = None
    game_ends_at: Optional[int] = None
    max_players: int
    mode: GameMode

    _on_waiting_start: Callable[[Optional[MessageJSON]], None] = PrivateAttr()
    _on_lobby_start: Callable[[Optional[MessageJSON]], None] = PrivateAttr()
    _on_game_start: Callable[[Optional[MessageJSON]], None] = PrivateAttr()
    _on_game_end: Callable[[Optional[MessageJSON]], None] = PrivateAttr()

    def __init__(
        self,
        room_name: str,
        map_name: str,
        max_players: int,
        mode: GameMode,
        on_waiting_start: Callable[[Optional[MessageJSON]], None],
        on_lobby_start: Callable[[Optional[MessageJSON]], None],
        on_game_start: Callable[[Optional[MessageJSON]], None],
        on_game_end: Callable[[Optional[MessageJSON]], None],
        **kwargs,
    ):
        super().__init__(room_name=room_name, map_name=map_name, max_players=max_players, mode=mode, **kwargs)
        self._on_waiting_start = on_waiting_start
        self._on_lobby_start = on_lobby_start
        self._on_game_start = on_game_start
        self._on_game_end = on_game_end
        self.start_waiting()

    def update(self, players: Dict[str, "Player"]) -> None:
        match self.state:
            case "waiting":
                self._update_waiting(players)
            case "lobby":
                self._update_lobby(players)
            case "game":
                self._update_game(players)

    def _update_waiting(self, players: Dict[str, "Player"]) -> None:
        if self._count_players(players) > 1:
            self.start_lobby()

    def _update_lobby(self, players: Dict[str, "Player"]) -> None:
        if self._count_players(players) == 1:
            self.start_waiting()
            return

        if self.lobby_ends_at and self.lobby_ends_at < self._current_time():
            self.start_game()

    def _update_game(self, players: Dict[str, "Player"]) -> None:
        if self._count_players(players) == 1:
            self._on_game_end()
            self.start_waiting()
            return

        if self.game_ends_at and self.game_ends_at < self._current_time():
            self._on_game_end(MessageJSON(type="timeout", from_="server", ts=self._current_time(), params={}))
            self.start_lobby()
            return

        if self.mode == "deathmatch" and self._count_active_players(players) == 1:
            player = self._get_winning_player(players)
            if player:
                self._on_game_end(
                    MessageJSON(type="won", from_="server", ts=self._current_time(), params={"name": player.name})
                )
                self.start_lobby()
            return

        if self.mode == "team deathmatch":
            team = self._get_winning_team(players)
            if team:
                self._on_game_end(
                    MessageJSON(type="won", from_="server", ts=self._current_time(), params={"name": f"{team} team"})
                )
                self.start_lobby()

    def start_waiting(self) -> None:
        self.lobby_ends_at = None
        self.game_ends_at = None
        self.state = "waiting"
        self._on_waiting_start()

    def start_lobby(self) -> None:
        self.lobby_ends_at = self._current_time() + Constants.LOBBY_DURATION
        self.game_ends_at = None
        self.state = "lobby"
        self._on_lobby_start()

    def start_game(self) -> None:
        self.lobby_ends_at = None
        self.game_ends_at = self._current_time() + Constants.GAME_DURATION
        self.state = "game"
        self._on_game_start()

    def _count_players(self, players: Dict[str, "Player"]) -> int:
        return len(players)

    def _count_active_players(self, players: Dict[str, "Player"]) -> int:
        return sum(1 for player in players.values() if player.is_alive)

    def _get_winning_player(self, players: Dict[str, "Player"]) -> Optional["Player"]:
        for player in players.values():
            if player.is_alive:
                return player
        return None

    def _get_winning_team(self, players: Dict[str, "Player"]) -> Optional[Team]:
        red_alive = False
        blue_alive = False

        for player in players.values():
            if player.is_alive:
                if player.team == "Red":
                    red_alive = True
                else:
                    blue_alive = True

        if red_alive and blue_alive:
            return None

        return "Red" if red_alive else "Blue"

    def _current_time(self) -> int:
        return int(datetime.now().timestamp() * 1000)
