import React, {useState} from 'react';
import axios from 'axios';
import {
    IconButton,
    Snackbar,
    SnackbarContent,
} from "@mui/material";
import AddLinkOutlinedIcon from '@mui/icons-material/AddLinkOutlined';


export const Invite = () => {
    const userId = window.Telegram?.WebApp.initDataUnsafe.user?.id
    const [copySuccess, setCopySuccess] = useState(false);

    const generateInviteLink = () => {
        if (userId) {
            axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}/invite_link`).then(({data}) => {
                setTimeout(() => {
                    navigator.clipboard.writeText(data.invite_link);
                }, 0)
                setCopySuccess(true);
            });
        }
    };

    const handleCloseSnackbar = () => {
        setCopySuccess(false);
    };

    return (
        <div>
            <div className="tasks__invite-task">
                <div className="tasks__share-link" onClick={generateInviteLink}>
                    <div>Invite friends to get bonuses</div>
                    <IconButton aria-label="generate">
                        <AddLinkOutlinedIcon fontSize={"large"}/>
                    </IconButton>
                </div>
            </div>
            <Snackbar
                open={copySuccess}
                autoHideDuration={2000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <SnackbarContent
                    message="Share Link Copied!"
                    sx={{
                        color: '#fff',
                        fontSize: '16px',
                        padding: '6px 20px',
                        borderRadius: '4px',
                        width: 'auto',
                        maxWidth: 'none',
                    }}
                />
            </Snackbar>
        </div>
    );
};
