import {useEffect, useState} from "react"
import axios from "axios"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"

export const ProfileTab = ({id}) => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/users/${id}/profile`)
      .then(({data}) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <Box sx={{display: "flex", justifyContent: "center", alignItems: "center", height: "100%"}}>
        <CircularProgress sx={{color: "#FFD700"}}/>
      </Box>
    )
  }

  if (!profile) {
    return (
      <Box sx={{p: 3, textAlign: "center"}}>
        <Typography sx={{color: "#888"}}>Failed to load profile</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{p: 2, pb: 10, maxWidth: 480, mx: "auto"}}>
      <Box sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        mt: 3,
        mb: 3,
      }}>
        <Box sx={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #FFD700, #FF8C00)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 700,
          color: "#1a1a2e",
        }}>
          {(profile.full_name || profile.username || "?")[0].toUpperCase()}
        </Box>

        <Typography sx={{color: "#fff", fontSize: 20, fontWeight: 700}}>
          {profile.full_name || profile.username || "Player"}
        </Typography>

        {profile.username && (
          <Typography sx={{color: "#888", fontSize: 14}}>
                        @{profile.username}
          </Typography>
        )}
      </Box>

      <Box sx={{display: "flex", flexDirection: "column", gap: 1.5}}>
        <StatCard label="Rating" value={profile.tokens || 0} icon="⭐"/>
        <StatCard label="Battles" value={profile.battles || 0} icon="⚔️"/>
        <StatCard label="Wins" value={profile.wins || 0} icon="🏆"/>
      </Box>
    </Box>
  )
}

const StatCard = ({label, value, icon}) => (
  <Box sx={{
    display: "flex",
    alignItems: "center",
    gap: 2,
    p: 2,
    borderRadius: 2,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
  }}>
    <Typography sx={{fontSize: 24}}>{icon}</Typography>
    <Box sx={{flex: 1}}>
      <Typography sx={{color: "#888", fontSize: 12}}>{label}</Typography>
      <Typography sx={{color: "#fff", fontSize: 18, fontWeight: 600}}>{value}</Typography>
    </Box>
  </Box>
)
