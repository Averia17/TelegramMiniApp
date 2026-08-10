package room

// TauntSpender is the server-side economy boundary used before a taunt is
// broadcast. Keeping it injectable makes the room logic testable and keeps
// account-service transport details out of the authoritative game model.
type TauntSpender interface {
	SpendTaunt(accessToken, tauntID string) error
}

var defaultTauntSpender TauntSpender

func SetTauntSpender(spender TauntSpender) {
	defaultTauntSpender = spender
}
