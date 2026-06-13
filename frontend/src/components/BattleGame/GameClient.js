export class GameClient {
    constructor(url, onStateUpdate, onMessage, onConnect, onDisconnect) {
        this.url = url;
        this.onStateUpdate = onStateUpdate;
        this.onMessage = onMessage;
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        this.ws = null;
        this.playerId = null;
        this.connected = false;
        this.myRoomId = null;
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.connected = true;
            if (this.onConnect) this.onConnect();
        };

        this.ws.onclose = () => {
            this.connected = false;
            if (this.onDisconnect) this.onDisconnect();
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('Parse error:', e);
            }
        };
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'state':
                this.lastState = msg;
                if (this.onStateUpdate) this.onStateUpdate(msg);
                break;
            case 'room_joined':
                this.playerId = msg.params?.playerId;
                this.myRoomId = msg.params?.roomId;
                if (this.onMessage) this.onMessage(msg);
                break;
            case 'room_list':
                if (this.onMessage) this.onMessage(msg);
                break;
            case 'match_found':
                if (this.onMessage) this.onMessage(msg);
                break;
            case 'joined':
            case 'left':
            case 'killed':
            case 'won':
            case 'timeout':
            case 'start':
            case 'stop':
            case 'waiting':
            case 'error':
                if (this.onMessage) this.onMessage(msg);
                break;
            default:
                break;
        }
    }

    send(type, value) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            type,
            ts: Date.now(),
            value,
        }));
    }

    join(playerName, roomName, roomMap, maxPlayers, mode) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            type: 'join',
            playerName: playerName || 'Player',
            roomName: roomName || '',
            roomMap: roomMap || 'small',
            maxPlayers: maxPlayers || 8,
            mode: mode || 'deathmatch',
        }));
    }

    joinById(roomId, playerName) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            type: 'join_by_id',
            roomId,
            playerName: playerName || 'Player',
        }));
    }

    listRooms() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'list_rooms' }));
    }

    findMatch(playerName) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            type: 'find_match',
            playerName: playerName || 'Player',
        }));
    }

    cancelMatch() {
        this.send('cancel_match');
    }

    move(x, y) {
        this.send('move', { x, y });
    }

    rotate(rotation) {
        this.send('rotate', { rotation });
    }

    shoot(angle) {
        this.send('shoot', { angle });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
