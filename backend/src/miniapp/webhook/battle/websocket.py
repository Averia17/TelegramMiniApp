import logging
from itertools import chain

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

from miniapp.webhook.battle.action_service import ActionService
from miniapp.webhook.battle.load_balancer import LoadBalancer

log = logging.getLogger(__name__)

load_balancer = LoadBalancer()

game_servers = {}  # battle_id : game_server
action_services: [int, ActionService] = {}  # player_id : action_service
battle_router = APIRouter(prefix="/battle")


@battle_router.websocket("/start")
async def start_battle(websocket: WebSocket):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id:
        await websocket.close(reason="Cookie user_id required")
        return

    all_players = list(chain.from_iterable(server.get_players_ids() for server in game_servers.values()))
    if user_id in all_players:
        await websocket.close(reason="Player already in battle")
        return

    await websocket.accept()
    await load_balancer.add_player_to_queue(user_id, websocket)
    game_server = await load_balancer.create_battle()

    if not game_server:
        try:
            while True:
                message = await websocket.receive_json()
                if message["type"] == "stop":
                    await websocket.close()
                    await load_balancer.remove_player_from_queue(user_id)
                    break
        except WebSocketDisconnect:
            await load_balancer.remove_player_from_queue(user_id)
    else:
        game_servers[game_server.id] = game_server
        log.info(f"BATTLE ID {game_server.id}")


@battle_router.websocket("/connect/{battle_id}")
async def connect_player(websocket: WebSocket, battle_id: str):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id or not battle_id:
        await websocket.close(reason="Cookie user_id required")
        return

    game_server = game_servers[battle_id]
    action_service = ActionService(game_server)

    action_services[user_id] = action_service

    await action_service.connect_player(websocket)

    message_handlers = {
        "attack_player": action_service.attack_player,
        "attack_camp": action_service.attack_camp,
        "move": action_service.move,
    }

    try:
        while True:
            message = await websocket.receive_json()
            handler = message_handlers[message["action"]]
            data = {"user_id": user_id}
            data.update(message["data"])
            await handler(**data)
    except WebSocketDisconnect:
        await action_service.connection_manager.disconnect(user_id)
