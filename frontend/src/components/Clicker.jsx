import tankImage from "../assets/images/tank.png"
import React, {useState, useEffect, useRef, useCallback} from 'react';
import axios from "axios"
import CircularProgress from "@mui/material/CircularProgress";

export const Clicker = () => {
    const [clicks, setClicks] = useState(0);
    const [coins, setCoins] = useState([]);
    const [inviteBonus, setInviteBonus] = useState(0);
    const [clicksAfterSave, setClicksAfterSave] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const userId = window.Telegram.WebApp.initDataUnsafe.user?.id

    useEffect(() => {
        if (userId) {
            setIsLoading(true)
            axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}`).then(({data}) => {
                setClicks(data["clicks"])
                setClicksAfterSave(data["clicks"])
                setInviteBonus(data["count_invites"])
            }).finally(() => setIsLoading(false))
        }
    }, [userId])

    useEffect(() => {
        const interval = setInterval(async () => {
            if (clicks > clicksAfterSave) {
                axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/users/click`, {
                    clicks: clicks,
                    user_id: userId
                }).then(({data}) => {
                    setClicksAfterSave(clicks);
                })
            }
        }, 500); // Send data every half second

        return () => clearInterval(interval);
    }, [clicks, clicksAfterSave, userId]);

    const handleTouchStart = (e) => {
        e.preventDefault();
        handleClick(e);
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
    };

    const handleClick = (event) => {
        let clickX = event.clientX;
        if (event.type.startsWith('touch')) {
            clickX = event.touches[0].clientX || event.changedTouches[0].clientX;
        }
        setClicks(prevClicks => prevClicks + (1 + inviteBonus));

        if (clickX < 50) {
            clickX = 50
        }
        if (clickX > (window.innerWidth - 50)) {
            clickX -= 20
        }
        const newCoinFromClick = {
            id: Date.now() + 1,
            style: {
                position: 'absolute',
                left: `${clickX - 20}px`,
                bottom: `100px`,
                transform: 'translateX(-50%)',
                zIndex: 9999,
                touchAction: 'none'
            },
        };
        setCoins(prevCoins => [...prevCoins, newCoinFromClick]);
    };

    return (
        <div className="click-page__container">
            <div className="click-page__header">
                {isLoading ? <CircularProgress size={24}/> :
                    <p className="click-page__text">
                        {clicks}
                        <img className="tb-coin-image-icon" src={tankImage} alt="Coin Image"></img>
                    </p>
                }
                <p className="click-page__text">Bonus x{(1 + inviteBonus)}</p>
            </div>
            <div className="clicker no-select">
                {coins.map((coin, index) => (
                    <div style={coin.style} className="spawned-image coin-container"
                         onClick={handleClick}
                         onTouchStart={handleTouchStart}
                         onTouchMove={handleTouchMove}
                         onTouchEnd={handleTouchEnd}
                         key={index}>
                        <div className="bonus-text">+ {(1 + inviteBonus)}</div>
                        <img
                            key={coin.id}
                            src={tankImage}
                            alt="Spawned"
                            className="tb-coin-image"
                        />
                    </div>
                ))}
            </div>
            <div className="tank-container">
                <div onClick={handleClick}
                     onTouchStart={handleTouchStart}
                     onTouchMove={handleTouchMove}
                     onTouchEnd={handleTouchEnd}
                     style={{ touchAction: 'none' }}
                >
                    <img
                        className="image"
                        src={tankImage}
                        alt="Tank Image"/>
                </div>
            </div>
        </div>
    );
};
