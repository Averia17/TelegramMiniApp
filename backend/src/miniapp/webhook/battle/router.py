import logging
from itertools import chain

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

from miniapp.webhook.battle.battle_manager import battle_managers, player_managers
from miniapp.webhook.battle.battle_queue_manager import BattleQueueManager

log = logging.getLogger(__name__)

battle_queue_manager = BattleQueueManager()

router = APIRouter(prefix="/battle")


@router.websocket("/start")
async def start_battle(websocket: WebSocket):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id:
        await websocket.close(reason="Cookie user_id required")
        return

    players_in_battle = list(chain.from_iterable(
        battle_manager.battle.get_players_ids() for battle_manager in battle_managers.values()
    ))
    if user_id in players_in_battle:
        await websocket.close(reason="Player already in battle")
        return

    await websocket.accept()
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
        battle_id = battle_manager.battle.id
        battle_managers[battle_id] = battle_manager
        log.info(f"Start battle {battle_id}")


@router.websocket("/connect/{battle_id}")
async def connect_player(websocket: WebSocket, battle_id: str):
    user_id = int(websocket.cookies.get("user_id", 0))
    if not user_id or not battle_id:
        await websocket.close(reason="Cookie user_id required")
        return

    battle_manager = battle_managers[battle_id]
    player_managers[user_id] = battle_manager

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
        "queue": battle_queue_manager.queue
    }
