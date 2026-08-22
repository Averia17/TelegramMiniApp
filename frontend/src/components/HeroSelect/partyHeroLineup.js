import {arrangePartyMembers} from "../Party/partyRoster.js"

const sameHero = (left, right) => String(left || "").toLowerCase() === String(right || "").toLowerCase()

export const getPartyHeroLineup = (party, playerId, heroes, selectedHero) => {
  if (!party?.partyId || !Array.isArray(heroes)) return []

  return arrangePartyMembers(party.members, playerId)
    .map(member => {
      const isLocal = String(member.playerId) === String(playerId)
      const heroName = isLocal && selectedHero ? selectedHero : member.hero
      const hero = heroes.find(candidate => sameHero(candidate.name, heroName))
      return {...member, hero, isLocal}
    })
    .filter(member => member.hero)
}
