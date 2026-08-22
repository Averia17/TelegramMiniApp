package provider

type Store interface {
	SaveRoom(room *RoomRecord) error
	GetRoom(roomId string) (*RoomRecord, error)
	ListRooms() ([]RoomRecord, error)
	AddPlayerToRoom(roomId string, player *PlayerRecord) error
	RemovePlayerFromRoom(roomId, playerId string) error
	SaveBattleResult(result *BattleResult) error
	GetLatestBattleResult(playerId string) (*BattleResult, error)
	ListBattleResults(playerId string, beforeEndedAt int64, beforeRoomId string, limit int) ([]*BattleResult, error)
}
