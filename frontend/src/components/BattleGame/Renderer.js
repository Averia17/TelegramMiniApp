function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 69, b: 0 };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function lightenColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
        r + (255 - r) * amount / 100,
        g + (255 - g) * amount / 100,
        b + (255 - b) * amount / 100
    );
}

function darkenColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
        r * (1 - amount / 100),
        g * (1 - amount / 100),
        b * (1 - amount / 100)
    );
}

if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        const [tl, tr, br, bl] = r;
        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
        return this;
    };
}

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
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
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
                // Solid wall - enhanced brick look
                ctx.fillStyle = '#3a2535';
                ctx.fillRect(wall.minX, wall.minY, wx, wy);

                // Brick pattern
                ctx.fillStyle = '#4d3345';
                const brickH = Math.max(4, wy / Math.ceil(wy / 8));
                const brickW = Math.max(4, wx / Math.ceil(wx / 8));
                const rows = Math.ceil(wy / brickH);
                const cols = Math.ceil(wx / brickW);
                for (let row = 0; row < rows; row++) {
                    const offset = row % 2 === 0 ? 0 : brickW * 0.4;
                    for (let col = -1; col < cols; col++) {
                        const bx = wall.minX + col * brickW + offset + 1;
                        const by = wall.minY + row * brickH + 1;
                        const bw = brickW - 2;
                        const bh = brickH - 2;
                        if (bx + bw > wall.minX && bx < wall.minX + wx && by + bh > wall.minY && by < wall.minY + wy) {
                            ctx.fillRect(
                                Math.max(bx, wall.minX),
                                Math.max(by, wall.minY),
                                Math.min(bw, wall.minX + wx - Math.max(bx, wall.minX)),
                                Math.min(bh, wall.minY + wy - Math.max(by, wall.minY))
                            );
                        }
                    }
                }

                // Top highlight
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(wall.minX, wall.minY, wx, 2);

                // Border
                ctx.strokeStyle = '#1a0f1a';
                ctx.lineWidth = 1;
                ctx.strokeRect(wall.minX, wall.minY, wx, wy);
            } else {
                // Half wall (bullets pass) - bush/cover look
                ctx.fillStyle = 'rgba(40, 80, 50, 0.5)';
                ctx.fillRect(wall.minX, wall.minY, wx, wy);

                // Leaf texture
                ctx.fillStyle = 'rgba(60, 110, 70, 0.4)';
                for (let i = 0; i < 4; i++) {
                    const lx = wall.minX + Math.random() * (wx - 4);
                    const ly = wall.minY + Math.random() * (wy - 4);
                    ctx.beginPath();
                    ctx.arc(lx + 2, ly + 2, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.strokeStyle = 'rgba(80, 140, 90, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(wall.minX, wall.minY, wx, wy);
            }
        }

        // Map border
        ctx.strokeStyle = '#6a4060';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, width, height);
    }

    drawPlayers(ctx) {
        if (!this.state.players) return;

        for (const [id, player] of Object.entries(this.state.players)) {
            if (!player) continue;

            const isMe = id === this.localPlayerId;
            const color = player.color || '#FF4500';
            ctx.save();
            ctx.translate(player.x, player.y);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(3, 3, player.radius + 1, (player.radius + 1) * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Outer glow ring for local player
            if (isMe) {
                const glowSize = player.radius + 8 + Math.sin(Date.now() / 200) * 2;
                ctx.beginPath();
                ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,215,0,0.12)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 0, glowSize - 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,215,0,0.3)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Body gradient
            const bodyGrad = ctx.createRadialGradient(
                -player.radius * 0.3, -player.radius * 0.3, 0,
                0, 0, player.radius
            );
            bodyGrad.addColorStop(0, lightenColor(color, 40));
            bodyGrad.addColorStop(0.7, color);
            bodyGrad.addColorStop(1, darkenColor(color, 30));

            ctx.beginPath();
            ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.strokeStyle = isMe ? '#FFD700' : darkenColor(color, 50);
            ctx.lineWidth = isMe ? 3 : 2;
            ctx.stroke();

            // Inner highlight
            ctx.beginPath();
            ctx.arc(-player.radius * 0.25, -player.radius * 0.25, player.radius * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();

            // Hero letter icon
            if (player.hero) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(12, player.radius * 0.9)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 3;
                ctx.fillText(player.hero[0], 0, 1);
                ctx.shadowBlur = 0;
            }

            // Direction indicator (arrow)
            ctx.rotate(player.rotation);
            const arrowColor = isMe ? '#FFD700' : '#fff';
            ctx.fillStyle = arrowColor;
            ctx.beginPath();
            ctx.moveTo(player.radius + 4, 0);
            ctx.lineTo(player.radius - 2, -4);
            ctx.lineTo(player.radius - 2, 4);
            ctx.closePath();
            ctx.fill();
            ctx.rotate(-player.rotation);

            // Hero name + player name
            ctx.fillStyle = '#fff';
            ctx.font = `bold 11px sans-serif`;
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 4;
            const label = player.hero ? `${player.hero} ${player.name}` : (player.name || '');
            ctx.fillText(label, 0, -player.radius - 10);
            ctx.shadowBlur = 0;

            // Lives bar
            const barW = 32;
            const barH = 5;
            const barX = -barW / 2;
            const barY = player.radius + 8;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath();
            ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);
            ctx.fill();
            const lifeRatio = player.lives / player.maxLives;
            ctx.fillStyle = lifeRatio > 0.5 ? '#4CAF50' : lifeRatio > 0.25 ? '#FF9800' : '#f44336';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW * lifeRatio, barH, 1);
            ctx.fill();

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
            if (!bullet) continue;

            ctx.save();
            ctx.translate(bullet.x, bullet.y);
            ctx.rotate(bullet.rotation);

            // Bullet glow
            ctx.beginPath();
            ctx.arc(0, 0, bullet.radius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,200,50,0.15)';
            ctx.fill();

            // Bullet body
            const bulletGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.radius);
            bulletGrad.addColorStop(0, '#fff');
            bulletGrad.addColorStop(0.5, bullet.color || '#FFD700');
            bulletGrad.addColorStop(1, darkenColor(bullet.color || '#FFD700', 30));
            ctx.beginPath();
            ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
            ctx.fillStyle = bulletGrad;
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

        // Debug map size
        if (this.mapData) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '11px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`Map: ${this.mapData.width}x${this.mapData.height} walls:${(this.mapData.walls||[]).length}`, 12, h - 8);
        }

        this.drawMinimap(ctx, w, h);
    }

    drawMinimap(ctx, w, h) {
        if (!this.mapData || !this.state) return;

        const mapW = this.mapData.width;
        const mapH = this.mapData.height;
        const size = Math.min(160, w * 0.22);
        const scale = size / Math.max(mapW, mapH);
        const mx = w - size - 12;
        const my = h - size - 28;

        ctx.save();

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx - 4, my - 4, size + 8, size + 8, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2a1a2a';
        ctx.fillRect(mx, my, size, size);

        if (this.mapData.walls) {
            ctx.fillStyle = 'rgba(100,70,100,0.7)';
            for (const wall of this.mapData.walls) {
                const wx = mx + wall.minX * scale;
                const wy = my + wall.minY * scale;
                const ww = (wall.maxX - wall.minX) * scale;
                const wh = (wall.maxY - wall.minY) * scale;
                if (ww > 0.5 && wh > 0.5) {
                    ctx.fillRect(wx, wy, ww, wh);
                }
            }
        }

        const monsters = this.state.monsters;
        if (monsters) {
            for (const monster of Object.values(monsters)) {
                if (!monster) continue;
                ctx.fillStyle = '#ff6633';
                ctx.beginPath();
                ctx.arc(mx + monster.x * scale, my + monster.y * scale, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const players = this.state.players;
        if (players) {
            for (const [id, player] of Object.entries(players)) {
                if (!player) continue;
                const isMe = id === this.localPlayerId;
                ctx.fillStyle = isMe ? '#FFD700' : (player.color || '#fff');
                ctx.beginPath();
                ctx.arc(mx + player.x * scale, my + player.y * scale, isMe ? 3.5 : 2, 0, Math.PI * 2);
                ctx.fill();
                if (isMe) {
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(mx + player.x * scale, my + player.y * scale, 5, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }

        if (this.localPlayerId && this.state.players?.[this.localPlayerId]) {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            const vx = mx + this.camera.x * scale;
            const vy = my + this.camera.y * scale;
            const vw = w * scale;
            const vh = h * scale;
            ctx.strokeRect(vx, vy, vw, vh);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('MAP', mx + size, my - 7);

        ctx.restore();
    }
}
