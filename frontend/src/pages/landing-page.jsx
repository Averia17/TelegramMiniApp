import * as React from 'react';

import {ClickerTab} from "../components/Tabs/ClickerTab.jsx";

import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import {LeaderboardTab} from "../components/Tabs/Leaderboard.jsx";
import {TasksTab} from "../components/Tabs/TasksTab.jsx";
import {ProfileTab} from "../components/Tabs/ProfileTab.jsx";
import {BattleTab} from "../components/Tabs/BattleTab.jsx";
import {ShopTab} from "../components/Tabs/ShopTab.jsx";


function CustomTabPanel(props) {
    const {children, value, index, ...other} = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <div>{children}</div>}
        </div>
    );
}

function a11yProps(index) {
    return {
        id: `simple-tab-${index}`,
        'aria-controls': `simple-tabpanel-${index}`
    };
}

const LandingPage = ({id}) => {
    const [value, setValue] = React.useState(0);

    const handleChange = (event, newValue) => {
        setValue(newValue);
    };

    return (
        <>
            <CustomTabPanel value={value} index={0}>
                <BattleTab id={id}/>
            </CustomTabPanel>
            <CustomTabPanel value={value} index={1}>
                <ShopTab id={id}/>
            </CustomTabPanel>
            <CustomTabPanel value={value} index={2}>
                <ClickerTab/>
            </CustomTabPanel>
            <CustomTabPanel value={value} index={3}>
                <LeaderboardTab/>
            </CustomTabPanel>
            <CustomTabPanel value={value} index={4}>
                <TasksTab onChangeTab={() => handleChange(null, 4)}/>
            </CustomTabPanel>
            <CustomTabPanel value={value} index={5}>
                <ProfileTab/>
            </CustomTabPanel>
            <Box sx={{
                borderBottom: 1,
                borderColor: 'divider',
                position: 'fixed',
                bottom: 0,
                left: 0,
                width: '100%',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <Tabs value={value} onChange={handleChange} aria-label="basic tabs example">
                    <Tab className="tab-label" label="Battle" {...a11yProps(0)} sx={{flex: 1}}/>
                    <Tab className="tab-label" label="Shop" {...a11yProps(1)} sx={{flex: 1}}/>
                    <Tab className="tab-label" label="Clicker" {...a11yProps(2)} sx={{flex: 1}}/>
                    <Tab className="tab-label" label="Rating" {...a11yProps(3)} sx={{flex: 1}}/>
                    <Tab className="tab-label" label="Tasks" {...a11yProps(4)} sx={{flex: 1}}/>
                    <Tab className="tab-label" label="Profile" {...a11yProps(5)} sx={{flex: 1}}/>
                </Tabs>
            </Box>
        </>
    )
}

export default LandingPage
