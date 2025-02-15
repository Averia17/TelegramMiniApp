import React, {useEffect, useState} from 'react';
import {Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Box} from '@mui/material';
import { EmojiEvents as EmojiEventsIcon } from '@mui/icons-material';

import axios from "axios";


export const LeaderboardTab = () => {
    const [users, setUsers] = useState([])

    useEffect(() => {
        axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/users/leaderboard`).then(({data}) => {
            setUsers(data)
        })
    }, [])

    return (
        <div className="landing-page__container">
            <Box display="flex" alignItems="center" className="page-title" mb={2}>
                <EmojiEventsIcon style={{fontSize: 40, marginRight: '10px', color: '#FFD700'}}/>
                <Typography variant="h4" style={{fontWeight: 'bold'}} >
                    Rating
                </Typography>
            </Box>
            <TableContainer sx={{maxHeight: "80vh", overflow: "auto"}} component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{fontWeight: "bold", fontSize: "1.2rem", paddingLeft: "10px", paddingRight: "10px"}}>№</TableCell>
                            <TableCell sx={{fontWeight: "bold", fontSize: "1.2rem", paddingLeft: 0}}>Name</TableCell>
                            <TableCell sx={{fontWeight: "bold", fontSize: "1.2rem"}}>Username</TableCell>
                            <TableCell sx={{fontWeight: "bold", fontSize: "1.2rem"}}>Tokens</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user, index) => (
                            <TableRow key={index}>
                                <TableCell sx={{fontWeight: "bold", fontSize: "1.2rem", paddingLeft: "10px", paddingRight: "10px"}}>{index + 1}</TableCell>
                                <TableCell sx={{fontSize: "1.2rem", maxWidth: "100px", paddingLeft: 0}}>{user.full_name}</TableCell>
                                <TableCell sx={{fontSize: "1.2rem", maxWidth: "100px"}}>{user.username}</TableCell>
                                <TableCell sx={{fontSize: "1.2rem"}}>{user.clicks}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </div>
    );
}