export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = null;
        this.camera = { x: 0, y: 0 };
        this.localPlayerId = null;
        this.mapData = null;
        this.wallImage = null;
        this.floorPattern = null;
        this.initAssets();
    }

    initAssets() {
        const ctx = this.ctx;

        // Create floor pattern
        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 32;
        floorCanvas.height = 32;
        const fctx = floorCanvas.getContext('2d');
        fctx.fillStyle = '#2d1b2e';
        fctx.fillRect(0, 0, 32, 32);
        fctx.fillStyle = '#362033';
        fctx.fillRect(0, 0, 16, 16);
        fctx.fillRect(16, 16, 16, 16);
        fctx.strokeStyle = '#1a0f1a';
        fctx.lineWidth = 0.5;
        fctx.strokeRect(0, 0, 32, 32);
        this.floorPattern = ctx.createPattern(floorCanvas, 'repeat');
    }

    setState(state) {
        this.state = state;
        if (state.map && !this.mapData) {
            this.mapData = state.map;
        }
        this.followLocalPlayer();
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }

    followLocalPlayer() {
        if (!this.state || !this.localPlayerId) return;
        const player = this.state.players[this.localPlayerId];
        if (!player) return;

        const targetX = player.x - this.canvas.width / 2;
        const targetY = player.y - this.canvas.height / 2;

        this.camera.x += (targetX - this.camera.x) * 0.12;
        this.camera.y += (targetY - this.camera.y) * 0.12;
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        if (!this.state) {
            ctx.fillStyle = '#1a0f1a';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Connecting...', w / 2, h / 2);
            return;
        }

        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        this.drawMap(ctx);
        this.drawProps(ctx);
        this.drawMonsters(ctx);
        this.drawBullets(ctx);
        this.drawPlayers(ctx);

        ctx.restore();

        this.drawHUD(ctx, w, h);
    }

    drawMap(ctx) {
        if (!this.mapData) return;
        const { width, height, tileSize, walls } = this.mapData;

        // Floor
        ctx.fillStyle = this.floorPattern || '#2d1b2e';
        ctx.fillRect(0, 0, width, height);

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= width; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Walls
        if (!walls) return;
        for (const wall of walls) {
            const wx = wall.maxX - wall.minX;
            const wy = wall.maxY - wall.minY;

            if (wall.type === 'full') {
                // Solid wall - brick look
                ctx.fillStyle = '#4a3040';
                ctx.fillRect(wall.minX, wall.minY, wx, wy);

                // Brick pattern
                ctx.fillStyle = '#5a3d50';
                const brickH = wy / 2;
                const brickW = wx / 2;
                for (let row = 0; row < 2; row++) {
                    const cols = row % 2 === 0 ? 2 : 2;
                    const offset = row % 2 === 0 ? 0 : brickW / 2;
                    for (let col = -1; col < cols; col++) {
                        ctx.fillRect(
                            wall.minX + col * brickW + offset + 1,
                            wall.minY + row * brickH + 1,
                            brickW - 2,
                            brickH - 2
                        );
                    }
                }

                // Border
                ctx.strokeStyle = '#2a1a2a';
                ctx.lineWidth = 1;
                ctx.strokeRect(wall.minX, wall.minY, wx, wy);
            } else {
                // Half wall (bullets pass) - subtle
                ctx.fillStyle = 'rgba(100, 60, 80, 0.4)';
                ctx.fillRect(wall.minX, wall.minY, wx, wy);
                ctx.strokeStyle = 'rgba(150, 100, 130, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(wall.minX, wall.minY, wx, wy);
            }
        }

        // Map border
        ctx.strokeStyle = '#6a4060';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, width, height);
    }

    drawPlayers(ctx) {
        if (!this.state.players) return;

        for (const [id, player] of Object.entries(this.state.players)) {
            if (!player || player.lives <= 0) continue;

            const isMe = id === this.localPlayerId;
            ctx.save();
            ctx.translate(player.x, player.y);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(2, 2, player.radius, player.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Body glow for local player
            if (isMe) {
                ctx.beginPath();
                ctx.arc(0, 0, player.radius + 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,215,0,0.15)';
                ctx.fill();
            }

            // Body
            ctx.beginPath();
            ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
            ctx.fillStyle = player.color || '#fff';
            ctx.fill();
            ctx.strokeStyle = isMe ? '#FFD700' : '#000';
            ctx.lineWidth = isMe ? 3 : 2;
            ctx.stroke();

            // Direction indicator
            ctx.rotate(player.rotation);
            ctx.fillStyle = isMe ? '#FFD700' : '#fff';
            ctx.beginPath();
            ctx.moveTo(player.radius + 2, 0);
            ctx.lineTo(player.radius - 4, -3);
            ctx.lineTo(player.radius - 4, 3);
            ctx.closePath();
            ctx.fill();
            ctx.rotate(-player.rotation);

            // Name
            ctx.fillStyle = '#fff';
            ctx.font = `${isMe ? 'bold ' : ''}11px sans-serif`;
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 3;
            ctx.fillText(player.name || '', 0, -player.radius - 8);
            ctx.shadowBlur = 0;

            // Lives bar
            const barW = 30;
            const barH = 4;
            const barX = -barW / 2;
            const barY = player.radius + 6;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barW, barH);
            const lifeRatio = player.lives / player.maxLives;
            ctx.fillStyle = lifeRatio > 0.5 ? '#4CAF50' : lifeRatio > 0.25 ? '#FF9800' : '#f44336';
            ctx.fillRect(barX, barY, barW * lifeRatio, barH);

            ctx.restore();
        }
    }

    drawMonsters(ctx) {
        if (!this.state.monsters) return;

        for (const [id, monster] of Object.entries(this.state.monsters)) {
            if (!monster) continue;

            ctx.save();
            ctx.translate(monster.x, monster.y);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(2, 2, monster.radius, monster.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Body
            ctx.beginPath();
            ctx.arc(0, 0, monster.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#8B4513';
            ctx.fill();
            ctx.strokeStyle = '#5C2D0A';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Eyes
            ctx.rotate(monster.rotation);
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(monster.radius * 0.4, -3, 2, 0, Math.PI * 2);
            ctx.arc(monster.radius * 0.4, 3, 2, 0, Math.PI * 2);
            ctx.fill();

            // Teeth
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(monster.radius * 0.6, -2);
            ctx.lineTo(monster.radius * 0.8, 0);
            ctx.lineTo(monster.radius * 0.6, 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    drawBullets(ctx) {
        if (!this.state.bullets) return;

        for (const bullet of this.state.bullets) {
            if (!bullet || !bullet.active) continue;

            // Trail
            ctx.save();
            ctx.translate(bullet.x, bullet.y);
            ctx.rotate(bullet.rotation);

            ctx.beginPath();
            ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
            ctx.fillStyle = bullet.color || '#FFD700';
            ctx.fill();

            // Glow
            ctx.beginPath();
            ctx.arc(0, 0, bullet.radius + 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,215,0,0.2)';
            ctx.fill();

            ctx.restore();
        }
    }

    drawProps(ctx) {
        if (!this.state.props) return;

        for (const prop of this.state.props) {
            if (!prop || !prop.active) continue;

            ctx.save();
            ctx.translate(prop.x, prop.y);

            // Glow
            const glowSize = prop.radius + 4 + Math.sin(Date.now() / 300) * 2;
            ctx.beginPath();
            ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,0,0,0.15)';
            ctx.fill();

            // Bottle
            ctx.fillStyle = '#cc0000';
            ctx.beginPath();
            ctx.arc(0, 0, prop.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#880000';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Shine
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(-prop.radius * 0.3, -prop.radius * 0.3, prop.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();

            // Cross symbol
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(3, 0);
            ctx.moveTo(0, -3);
            ctx.lineTo(0, 3);
            ctx.stroke();

            ctx.restore();
        }
    }

    drawHUD(ctx, w, h) {
        if (!this.state) return;

        // Top bar
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, w, 44);

        ctx.fillStyle = '#fff';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';

        const game = this.state.game;
        if (game) {
            const modeText = game.mode === 'team deathmatch' ? 'Team DM' : 'DM';
            ctx.fillText(modeText, 12, 28);

            if (game.state === 'lobby' && game.lobbyEndsAt) {
                const remaining = Math.max(0, Math.ceil((game.lobbyEndsAt - Date.now()) / 1000));
                ctx.fillStyle = '#FFD700';
                ctx.fillText(`Lobby: ${remaining}s`, 80, 28);
            } else if (game.state === 'game' && game.gameEndsAt) {
                const remaining = Math.max(0, Math.ceil((game.gameEndsAt - Date.now()) / 1000));
                ctx.fillStyle = remaining > 10 ? '#fff' : '#f44336';
                ctx.fillText(`${remaining}s`, 80, 28);
            } else if (game.state === 'waiting') {
                ctx.fillStyle = '#aaa';
                ctx.fillText('Waiting for players...', 80, 28);
            }
        }

        if (this.localPlayerId && this.state.players) {
            const me = this.state.players[this.localPlayerId];
            if (me) {
                ctx.textAlign = 'right';
                ctx.fillStyle = '#4CAF50';
                ctx.fillText(`HP ${me.lives}/${me.maxLives}`, w - 12, 20);
                ctx.fillStyle = '#FFD700';
                ctx.fillText(`Kills ${me.kills}`, w - 12, 36);
            }
        }

        // Player count
        const playerCount = Object.keys(this.state.players || {}).length;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${playerCount} players`, w / 2, 28);
    }
}
