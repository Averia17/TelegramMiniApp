import logging
from dataclasses import asdict
from itertools import chain

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from miniapp.webhook.battle.battle_manager import battle_managers, player_managers
from miniapp.webhook.battle.battle_queue_manager import BattleQueueManager
from miniapp.webhook.battle.entities import MessageJSON
from miniapp.webhook.battle.game_room import GameRoom

log = logging.getLogger(__name__)

battle_queue_manager = BattleQueueManager()

router = APIRouter(prefix="/battle")


@router.websocket("/start")
async def start_battle(websocket: WebSocket):
    await websocket.accept()
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id:
        await websocket.close(reason="Cookie user_id required")
        return

    players_in_battle = list(
        chain.from_iterable(battle_manager.battle.get_players_ids() for battle_manager in battle_managers.values())
    )
    if user_id in players_in_battle:
        await websocket.close(reason="Player already in battle")
        return

    await battle_queue_manager.add_player_to_queue(user_id, websocket)
    battle_manager = await battle_queue_manager.create_battle()

    if not battle_manager:
        try:
            while True:
                message = await websocket.receive_json()
                if message["type"] == "stop":
                    await websocket.close()
                    await battle_queue_manager.remove_player_from_queue(user_id)
                    break
        except WebSocketDisconnect:
            await battle_queue_manager.remove_player_from_queue(user_id)
    else:
        log.info(f"Start battle {battle_manager.battle.id}")


@router.websocket("/connect/{battle_id}")
async def connect_player(websocket: WebSocket, battle_id: str):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id or not battle_id:
        await websocket.close(reason="Cookie user_id required")
        return

    battle_manager = battle_managers[battle_id]

    await battle_manager.connect_player(websocket)

    message_handlers = {
        "attack_player": battle_manager.attack_player,
        "attack_camp": battle_manager.attack_camp,
        "move": battle_manager.move,
    }

    try:
        while True:
            message = await websocket.receive_json()
            handler = message_handlers[message["action"]]
            data = {"user_id": user_id}
            data.update(message["data"])
            await handler(**data)
    except WebSocketDisconnect:
        await battle_manager.connection_manager.disconnect(user_id)


@router.get("/player_state/{played_id}")
async def player_state(played_id: int):
    if battle_manager := player_managers.get(played_id):
        return {"battle_id": battle_manager.battle.id}
    return {}


@router.get("/server_state")
async def server_state():
    return {
        "players_in_battle": list(player_managers.keys()),
        "battles": list(battle_managers.keys()),
        "queue": battle_queue_manager.queue,
    }


class WebSocketClient:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.session_id = id(self)  # простой идентификатор

    async def send(self, message_type: str, message: MessageJSON):
        message = asdict(message)
        await self.websocket.send_json({"type": message_type, "message": message})


rooms: dict[str, "GameRoom"] = {}  # имя комнаты -> объект GameRoom
import uuid
from datetime import datetime

from fastapi import HTTPException, WebSocket
from pydantic import BaseModel


class RoomOptions(BaseModel):
    playerName: str
    roomName: str
    roomMap: str
    roomMaxPlayers: int
    mode: str


class JoinOptions(BaseModel):
    playerName: str


matchmake_router = APIRouter(prefix="/matchmake")


# HTTP endpoint для создания комнаты (аналог client.create)
@matchmake_router.post("/create/{room_name}")
async def create_room(room_name: str, options: RoomOptions):
    print(126, "CREATE ROOM ", room_name)
    if room_name in rooms:
        raise HTTPException(status_code=400, detail="Room already exists")

    # Создаем комнату через ваш существующий механизм
    room = GameRoom().on_create(
        options={
            "roomName": options.roomName,
            "playerName": options.playerName,
            "roomMap": options.roomMap,
            "roomMaxPlayers": options.roomMaxPlayers,
            "mode": options.mode,
        }
    )
    rooms[room_name] = room

    # Генерируем ответ в формате Colyseus
    response = {
        "room": {
            "clients": 1,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "maxClients": options.roomMaxPlayers,
            "metadata": {
                "playerName": options.playerName,
                "roomName": options.roomName,
                "roomMap": options.roomMap,
                "roomMaxPlayers": options.roomMaxPlayers,
                "mode": options.mode,
            },
            "name": room_name,
            "processId": str(uuid.uuid4())[:8],
            "roomId": room_name,  # или генерируйте уникальный ID если нужно
        },
        "sessionId": str(uuid.uuid4())[:8],
    }

    return response


@matchmake_router.post("/join/{room_id}")
async def join_room(room_id: str, options: JoinOptions):
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    room = rooms[room_id]

    # Генерируем ответ в формате Colyseus
    response = {
        "room": {
            "clients": len(room.clients) + 1 if hasattr(room, "clients") else 1,
            "createdAt": datetime.utcnow().isoformat() + "Z",  # В реальности нужно хранить время создания
            "maxClients": room.max_clients if hasattr(room, "max_clients") else 4,
            "metadata": {
                "playerName": options.playerName,
                "roomName": room_id,
                "roomMap": getattr(room, "room_map", "small"),
                "roomMaxPlayers": getattr(room, "max_clients", 4),
                "mode": getattr(room, "mode", "deathmatch"),
            },
            "name": "game",
            "processId": str(uuid.uuid4())[:8],
            "roomId": room_id,
        },
        "sessionId": str(uuid.uuid4())[:8],
    }

    return response


@router.websocket("/ws/{room_name}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_name: str, player_name: str):
    await websocket.accept()
    if room_name not in rooms:
        room = GameRoom().on_create(
            options={
                "roomName": room_name,
                "playerName": player_name,
                "roomMaxPlayers": 4,
                "mode": "deathmatch",
            }
        )
        rooms[room_name] = room

    room = rooms[room_name]
    client = WebSocketClient(websocket)
    room.on_join(client, {"playerName": player_name})

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            message = data.get("message", {})
            room.on_client_message(client, message_type, message)
    except WebSocketDisconnect:
        room.on_leave(client)
