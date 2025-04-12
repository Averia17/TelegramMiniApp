from zoneinfo import ZoneInfo

MAX_X_LOCATION = 1800 - 100
MAX_Y_LOCATION = 3200 - 60

TIMEZONE = ZoneInfo("Etc/GMT-3")

class Constants:
    APP_TITLE = 'BATTLE'

    # General
    WS_PORT = 3001
    ROOM_NAME = 'game'
    ROOM_REFRESH = 3000
    PLAYERS_REFRESH = 1000
    DEBUG = True

    # Game
    MAPS_NAMES = ['small', 'gigantic']
    ROOM_PLAYERS_MIN = 2
    ROOM_PLAYERS_MAX = 16
    ROOM_PLAYERS_SCALES = [2, 4, 8, 16]
    ROOM_NAME_MAX = 16
    PLAYER_NAME_MAX = 16
    LOG_LINES_MAX = 5
    LOBBY_DURATION = 1000 * 10 // 10 # seconds
    GAME_DURATION = 1000 * 90 // 90 # seconds
    GAME_MODES = ['deathmatch', 'team deathmatch']

    # Background
    BACKGROUND_COLOR = '#25131A'

    # Tile(rectangle)
    TILE_SIZE = 32

    # Player(circle)
    PLAYER_SIZE = 32
    PLAYER_SPEED = 1
    PLAYER_MAX_LIVES = 3
    PLAYER_WEAPON_SIZE = 12 # The bigger, the further away a bullet will be shot from
    PLAYER_HEARING_DISTANCE = 256

    # Monster
    MONSTERS_COUNT = 3
    MONSTER_SIZE = 32
    MONSTER_SPEED_PATROL = 0.75
    MONSTER_SPEED_CHASE = 1.25
    MONSTER_SIGHT = 192
    MONSTER_LIVES = 3
    MONSTER_IDLE_DURATION_MIN = 1000
    MONSTER_IDLE_DURATION_MAX = 3000
    MONSTER_PATROL_DURATION_MIN = 1000
    MONSTER_PATROL_DURATION_MAX = 3000
    MONSTER_ATTACK_BACKOFF = 3000

    # Props(rectangle)
    FLASKS_COUNT = 3
    FLASK_SIZE = 24

    # Bullet(circle)
    BULLET_SIZE = 8
    BULLET_SPEED = 4
    BULLET_RATE = 800 # The bigger, the slower
