import {Invite} from "../Tasks/Invite.jsx";
import {Tasks} from "../Tasks/Tasks.jsx";
import {Typography} from "@mui/material";

export const TasksTab = ({onChangeTab}) => {
    return <div className="tasks">
        <Typography variant="h4" style={{fontWeight: 'bold'}} className="page-title">
            📝️ Tasks
        </Typography>
        <Invite/>
        <Tasks onChangeTab={onChangeTab}/>
    </div>
}