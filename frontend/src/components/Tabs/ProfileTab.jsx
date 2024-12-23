import React, {useEffect, useState} from 'react';
import axios from 'axios';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import {SnackbarContent} from "@mui/material";

const TBUsernameComponent = ({tbUsername, userId}) => {
    const [username, setUsername] = useState(tbUsername);
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('success');

    const handleUpdate = () => {
        axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}`, {tb_username: username})
            .then(({data}) => {
                setUsername(data["tb_username"]);
                setMessage('TB Username updated successfully!');
                setSeverity('success');
                setOpen(true);
                if(!tbUsername) {
                    setTimeout(() => {
                        const reward = 1000;
                        axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/complete_task`, {
                            task_id: 4,
                            reward: reward
                        }).then(() => {
                            setMessage(`You complete task and receive reward ${reward}`);
                            setSeverity('success');
                            setOpen(true);
                        })
                    }, 2000);
                }
            })
            .catch(({response}) => {
                console.log(response.data.detail);
                setMessage(`Failed! ${response.data.detail}`);
                setSeverity('error');
                setOpen(true);
            });
    };

    const handleClose = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setOpen(false);
    };

    return (
        <div className="tb-username-component">
            <div className="label">TB Username</div>
            <input
                type="text"
                value={username}
                placeholder={`Enter your TB Nick/UserID`}
                className="input"
                onChange={(e) => setUsername(e.target.value)}
            />
            <button className="click-button" onClick={handleUpdate}>
                Confirm
            </button>
            <Snackbar open={open} autoHideDuration={6000} onClose={handleClose}
                      anchorOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <Alert onClose={handleClose} severity={severity} sx={{
                    color: "black",
                    fontSize: '14px',
                    padding: '6px 20px',
                    borderRadius: '4px',
                    width: '100%',
                }}>
                    {message}
                </Alert>
            </Snackbar>
        </div>
    );
};


const TokenExchangeComponent = ({clicks}) => {
    const exchangeRate = 10;
    const [openSnackbar, setOpenSnackbar] = useState(false);

    const handleCloseSnackbar = () => {
        setOpenSnackbar(false);
    };

    return (
        <div className="token-exchange-component">
            <div className="label">You can exchange all your tokens for TB gold.</div>
            <div className="label">Exchange rate {exchangeRate} tokens : 1 gold.</div>
            <div>
                {clicks > 0 ? (
                    <div>
                        <div className="clicks-row">
                            <div className="clicks">{clicks} tokens</div>
                            <div className="clicks">→</div>
                            <div className="clicks">{Math.floor(clicks / exchangeRate)} gold</div>
                        </div>
                        <button className="click-button" onClick={() => setOpenSnackbar(true)}>Exchange</button>
                    </div>
                ) : (
                    <div className="no-tokens">You have no tokens to exchange</div>
                )}
            </div>
            <Snackbar
                open={openSnackbar}
                autoHideDuration={3000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <SnackbarContent
                    message="This feature will be available in next release!"
                    sx={{
                        color: '#fff',
                        fontSize: '16px',
                        padding: '6px 20px',
                        borderRadius: '4px',
                        width: 'auto',
                    }}
                />
            </Snackbar>
        </div>
    );
};

export const ProfileTab = () => {
    const userId = window.Telegram?.WebApp.initDataUnsafe.user?.id
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(undefined);

    useEffect(() => {
        if (userId) {
            setIsLoading(true);
            axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/profile`)
                .then(({data}) => {
                    setUser(data);
                })
                .finally(() => setIsLoading(false));
        }
    }, [userId]);

    return (
        <div className="profile-tab">
            <Typography variant="h4" style={{fontWeight: 'bold'}} className="page-title">
                👤 Profile
            </Typography>
            {isLoading && <div className="loading"><CircularProgress size={24}/></div>}
            {user && (
                <div className="user-info">
                    <div className="username">@{user.username}</div>
                    <div className="full-name">{user.full_name}</div>
                    <TBUsernameComponent tbUsername={user.tb_username} userId={userId}/>
                    <TokenExchangeComponent clicks={user.clicks}/>
                    <div className="invited-users">
                        <div className="label">Invited users:</div>
                        {user.invited_users.length === 0 ? (
                            <div className="user-item">You have no invited users</div>
                        ) : (
                            user.invited_users.map((user, index) => <div className="user-item" key={user}>{index + 1}. @{user}</div>)
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
