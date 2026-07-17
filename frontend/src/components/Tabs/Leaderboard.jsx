import {useEffect, useState} from "react"
import axios from "axios"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import {LB_URL} from "../../utils/urls.js"

export const Leaderboard = () => {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${LB_URL}/leaderboard`)
      .then(({data}) => setPlayers(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Box sx={{display: "flex", justifyContent: "center", alignItems: "center", height: "100%"}}>
        <CircularProgress sx={{color: "#FFD700"}}/>
      </Box>
    )
  }

  return (
    <Box sx={{p: 2, pb: 10, maxWidth: 480, mx: "auto"}}>
      <Box sx={{textAlign: "center", mb: 3, mt: 2}}>
        <Typography sx={{fontSize: 28, mb: 0.5}}>🏆</Typography>
        <Typography sx={{color: "#FFD700", fontSize: 20, fontWeight: 700}}>
                    Leaderboard
        </Typography>
      </Box>

      {players.length === 0 ? (
        <Typography sx={{color: "#666", textAlign: "center", mt: 4}}>
                    No players yet
        </Typography>
      ) : (
        <Box sx={{display: "flex", flexDirection: "column", gap: 1}}>
          {players.map((p, i) => (
            <PlayerRow key={p.playerId} player={p} rank={i + 1}/>
          ))}
        </Box>
      )}
    </Box>
  )
}

const PlayerRow = ({player, rank}) => {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <Box sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 1.5,
      borderRadius: 2,
      background: rank <= 3 ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
      border: rank <= 3 ? "1px solid rgba(255,215,0,0.2)" : "1px solid rgba(255,255,255,0.05)",
    }}>
      <Box sx={{
        width: 32,
        textAlign: "center",
        fontSize: medal ? 20 : 14,
        fontWeight: 700,
        color: medal ? "#fff" : "#666",
      }}>
        {medal || rank}
      </Box>

      <Box sx={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: `hsl(${(player.playerId || "").charCodeAt(0) * 37 % 360}, 60%, 50%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
      }}>
        {(player.name || "?")[0].toUpperCase()}
      </Box>

      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography sx={{
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {player.name || "Unknown"}
        </Typography>
        <Typography sx={{color: "#666", fontSize: 11}}>
          {player.games || 0} games · {player.wins || 0} wins
        </Typography>
      </Box>

      <Typography sx={{
        color: "#FFD700",
        fontSize: 16,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {player.score || 0}
      </Typography>
    </Box>
  )
}
