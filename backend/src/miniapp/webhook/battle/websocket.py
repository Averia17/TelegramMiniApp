import logging

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

from miniapp.webhook.battle.connection_manager import ConnectionManager
from miniapp.webhook.battle.game_service import GameService
from miniapp.webhook.battle.action_service import ActionService

log = logging.getLogger(__name__)


game_service = GameService()
connection_manager = ConnectionManager()
action_service = ActionService(game_service, connection_manager)

battle_router = APIRouter(prefix="/battle")

message_handlers = {
    "attack_player": action_service.attack_player,
    "attack_camp": action_service.attack_camp,
    "move": action_service.move,
}

@battle_router.websocket("/connect")
async def player_connect(websocket: WebSocket):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id:
        return

    await action_service.connect_player(websocket)

    try:
        while True:
            message = await websocket.receive_json()
            handler = message_handlers[message["action"]]
            data = {"user_id": user_id}
            data.update(message["data"])
            await handler(**data)
    except WebSocketDisconnect:
        await connection_manager.disconnect(user_id)
