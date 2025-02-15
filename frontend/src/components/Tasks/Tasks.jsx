import React, {useEffect, useState} from 'react';
import {Card, CardContent, Typography, Button, Box, CircularProgress} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import axios from "axios";

const TaskItem = ({task, setCompletedTasksIds, completed, userId}) => {
    const [isLoading, setIsLoading] = useState(false);

    const completeTask = async () => {
        if (userId) {
            setIsLoading(true)
            if (task.link.includes("t.me")) {
                window.Telegram.WebApp.openTelegramLink(task.link)
            } else if (task.link) {
                window.Telegram.WebApp.openLink(task.link)
            }
            const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}/complete_task`,
                {task_id: task.id, reward: task.reward}
            )
            setTimeout(() => {
                setIsLoading(false)
                setCompletedTasksIds(response.data["completed_tasks"])
            }, 7000)
        }
    }

    return (
        <Card sx={{mb: 2}}>
            <CardContent sx={{padding: "8px 16px", "&:last-child": {paddingBottom: "8px"}}}>
                <Box className="task-title-container">
                    <Typography sx={{fontSize: "1.2rem"}} component="div" mr={1}>
                        {task.description}
                    </Typography>
                    {userId &&
                        <div>
                            {userId && isLoading ? (
                                <CircularProgress size={24}/>
                            ) : completed ? (
                                <CheckCircleIcon color="success"/>
                            ) : (<button disabled={isLoading} className="click-button" onClick={completeTask}>
                                    {task.reward} coins
                                </button>
                            )}
                        </div>
                    }
                </Box>
            </CardContent>
        </Card>
    );
}
const LinkAccount = ({onChangeTab, completed}) => {
    /* unique logic with redirection to profile*/

    return <Card sx={{mb: 2}}>
        <CardContent sx={{padding: "8px 16px", "&:last-child": {paddingBottom: "8px"}}}>
            <Box className="task-title-container">
                <Typography sx={{fontSize: "1.2rem"}} component="div" mr={1}>
                    Link Account
                </Typography>
                {completed ? <CheckCircleIcon color="success"/> :
                    <div>
                        <button className="click-button" onClick={onChangeTab}>
                            1000 coins
                        </button>
                    </div>
                }

            </Box>
        </CardContent>
    </Card>
}
export const Tasks = ({onChangeTab}) => {
    const [completedTaskIds, setCompletedTasksIds] = useState(undefined)
    const [accUsername, setAccUsername] = useState(undefined)
    const [isLoading, setIsLoading] = useState(false);

    const userId = window.Telegram?.WebApp.initDataUnsafe.user?.id

    const tasks = [
        {
            id: 1,
            description: "Subscribe Durov Channel",
            link: "https://t.me/durov",
            reward: 500
        },
        {
            id: 2,
            description: "Follow github",
            link: "https://github.com/Averia17",
            reward: 500
        },
    ]

    useEffect(() => {
        if (userId) {
            setIsLoading(true)
            axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}/completed_tasks`).then(({data}) => {
                setCompletedTasksIds(data["completed_tasks"])
                setAccUsername(data["tb_username"])
            }).finally(() => setIsLoading(false));
        }
    }, [userId])

    return (
        <div>
            {isLoading && <CircularProgress size={24}/>}
            {completedTaskIds && tasks.map(task => <TaskItem
                task={task}
                setCompletedTasksIds={setCompletedTasksIds}
                completed={completedTaskIds.includes(task.id)}
                userId={userId}/>
            )
            }
            <LinkAccount
                onChangeTab={onChangeTab}
                completed={accUsername && accUsername.length > 0}
            />
        </div>
    );
}
