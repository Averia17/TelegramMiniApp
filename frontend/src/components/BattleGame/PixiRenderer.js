import * as PIXI from 'pixi.js';

console.log('✓ PixiRenderer.js loaded - 8-direction Brawl Stars style with UI');

// 8 directions: 0°(R), 45°(RD), 90°(D), 135°(LD), 180°(L), 225°(LU), 270°(U), 315°(RU)
const DIRECTIONS_8 = [0, 45, 90, 135, 180, 225, 270, 315];
const DIRECTION_COUNT = 8;

export class PixiRenderer {
  constructor(canvasElement, width = 1024, height = 768) {
    this.width = width;
    this.height = height;
    this.app = new PIXI.Application({
      view: canvasElement,
      width,
      height,
      backgroundColor: 0xadd8e6,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.gameState = null;
    this.localPlayerId = null;
    this.textures = {};
    this.sprites = {
      players: {},
      monsters: {},
      props: {},
      bullets: {},
    };

    // Layers for depth sorting
    this.layers = {
      floorLayer: new PIXI.Container(),
      wallLayer: new PIXI.Container(),
      propLayer: new PIXI.Container(),
      monsterLayer: new PIXI.Container(),
      bulletLayer: new PIXI.Container(),
      playerLayer: new PIXI.Container(),
      uiLayer: new PIXI.Container(),
    };

    Object.values(this.layers).forEach((layer) => {
      this.app.stage.addChild(layer);
    });

    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraSmooth = 0.1;
    this.zoom = 0.7;

    // UI tracking
    this.uiElements = {
      healthBar: null,
      healthFill: null,
      minimapContainer: null,
      playerCountText: null,
    };

    this.generateTextures();
    this.mapWidth = 1024;
    this.mapHeight = 768;
    this.initializeUI();
  }

  createStarPoints(centerX, centerY, points, outerRadius, innerRadius) {
    const angles = [];
    for (let i = 0; i < points * 2; i++) {
      angles.push((i * Math.PI) / points);
    }
    const vertices = [];
    angles.forEach((angle, i) => {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = centerX + Math.cos(angle - Math.PI / 2) * radius;
      const y = centerY + Math.sin(angle - Math.PI / 2) * radius;
      vertices.push(x, y);
    });
    return vertices;
  }

  darkenColor(color, amount) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return (
      ((Math.floor(r * (1 - amount)) << 16) |
        (Math.floor(g * (1 - amount)) << 8) |
        Math.floor(b * (1 - amount))) >>> 0
    );
  }

  lightenColor(color, amount) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return (
      ((Math.min(255, Math.floor(r + (255 - r) * amount)) << 16) |
        (Math.min(255, Math.floor(g + (255 - g) * amount)) << 8) |
        Math.min(255, Math.floor(b + (255 - b) * amount))) >>> 0
    );
  }

  generateTextures() {
    // Enhanced floor with better texture
    const floorGfx = new PIXI.Graphics();
    floorGfx.beginFill(0x7cb342);
    floorGfx.drawRect(0, 0, 256, 256);
    floorGfx.endFill();

    // Grass patches with variation
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const size = Math.random() * 12 + 3;
      const shade = Math.random() > 0.5 ? 0x9ccc65 : 0x7cb342;
      floorGfx.beginFill(shade, 0.7);
      floorGfx.drawRect(x, y, size, size);
      floorGfx.endFill();
    }

    // Darker grass spots for shadow effect
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      floorGfx.beginFill(0x558b2f, 0.3);
      floorGfx.drawCircle(x, y, Math.random() * 8 + 2);
      floorGfx.endFill();
    }

    this.textures.floor = this.app.renderer.generateTexture(floorGfx);
    floorGfx.destroy();

    const heroColors = {
      red: 0xff5252,
      blue: 0x42a5f5,
      green: 0x66bb6a,
      yellow: 0xffee58,
      purple: 0xab47bc,
      orange: 0xffa726,
    };

    Object.entries(heroColors).forEach(([colorName, color]) => {
      const heroGfx = new PIXI.Graphics();
      const brighterColor = this.lightenColor(color, 0.4);
      const darkerColor = this.darkenColor(color, 0.4);
      const darkestColor = this.darkenColor(color, 0.6);
      const skinColor = 0xf5b896;
      const darkSkinColor = this.darkenColor(skinColor, 0.3);

      // SHADOW
      heroGfx.beginFill(0x000000, 0.25);
      heroGfx.drawEllipse(60, 118, 50, 12);
      heroGfx.endFill();

      // LEGS/PANTS BASE (darker for depth)
      heroGfx.beginFill(0x2c3e50);
      heroGfx.drawCircle(48, 105, 12);
      heroGfx.drawCircle(72, 105, 12);
      heroGfx.endFill();

      // Leg shadow (inner darker)
      heroGfx.beginFill(0x1a252f);
      heroGfx.drawCircle(48, 108, 10);
      heroGfx.drawCircle(72, 108, 10);
      heroGfx.endFill();

      // BOOTS
      heroGfx.beginFill(0x212121);
      heroGfx.drawCircle(48, 116, 9);
      heroGfx.drawCircle(72, 116, 9);
      heroGfx.endFill();

      // Boot highlight
      heroGfx.beginFill(0x424242, 0.5);
      heroGfx.drawCircle(46, 113, 5);
      heroGfx.drawCircle(70, 113, 5);
      heroGfx.endFill();

      // BODY MAIN (torso)
      heroGfx.beginFill(color);
      heroGfx.drawCircle(60, 65, 32);
      heroGfx.endFill();

      // Body darker bottom shadow (3D effect)
      heroGfx.beginFill(darkestColor, 0.6);
      heroGfx.drawCircle(60, 72, 30);
      heroGfx.endFill();

      // Body brighter top (light source from top-left)
      heroGfx.beginFill(brighterColor, 0.7);
      heroGfx.drawCircle(50, 50, 20);
      heroGfx.endFill();

      // Side shading (left arm attachment point)
      heroGfx.beginFill(darkerColor, 0.5);
      heroGfx.drawCircle(35, 60, 16);
      heroGfx.endFill();

      // ARMS
      // Left arm
      heroGfx.beginFill(color);
      heroGfx.drawCircle(32, 55, 14);
      heroGfx.endFill();

      heroGfx.beginFill(darkerColor, 0.4);
      heroGfx.drawCircle(32, 60, 12);
      heroGfx.endFill();

      // Right arm (weapon arm)
      heroGfx.beginFill(color);
      heroGfx.drawCircle(88, 55, 14);
      heroGfx.endFill();

      heroGfx.beginFill(darkerColor, 0.4);
      heroGfx.drawCircle(88, 60, 12);
      heroGfx.endFill();

      // HANDS
      // Left hand
      heroGfx.beginFill(skinColor);
      heroGfx.drawCircle(18, 60, 10);
      heroGfx.endFill();

      heroGfx.beginFill(darkSkinColor, 0.5);
      heroGfx.drawCircle(18, 64, 8);
      heroGfx.endFill();

      // Right hand
      heroGfx.beginFill(skinColor);
      heroGfx.drawCircle(106, 52, 10);
      heroGfx.endFill();

      heroGfx.beginFill(darkSkinColor, 0.5);
      heroGfx.drawCircle(106, 56, 8);
      heroGfx.endFill();

      // WEAPON (gun)
      heroGfx.lineStyle(6, 0x212121);
      heroGfx.moveTo(106, 52);
      heroGfx.lineTo(135, 38);

      // Weapon barrel
      heroGfx.beginFill(0x424242);
      heroGfx.drawRect(132, 34, 12, 10);
      heroGfx.endFill();

      // Weapon highlight
      heroGfx.beginFill(0x666666, 0.4);
      heroGfx.drawRect(132, 34, 12, 4);
      heroGfx.endFill();

      // NECK
      heroGfx.beginFill(skinColor);
      heroGfx.drawRect(55, 38, 10, 12);
      heroGfx.endFill();

      // HEAD (main)
      heroGfx.beginFill(color);
      heroGfx.drawCircle(60, 25, 22);
      heroGfx.endFill();

      // Head darker back/bottom
      heroGfx.beginFill(darkestColor, 0.5);
      heroGfx.drawCircle(60, 32, 20);
      heroGfx.endFill();

      // Head bright top (light reflection)
      heroGfx.beginFill(brighterColor, 0.8);
      heroGfx.drawCircle(50, 15, 12);
      heroGfx.endFill();

      // FACE DETAILS
      // Eyes (white)
      heroGfx.beginFill(0xffffff);
      heroGfx.drawCircle(54, 22, 6);
      heroGfx.drawCircle(66, 22, 6);
      heroGfx.endFill();

      // Eye shadows
      heroGfx.beginFill(0xf0f0f0, 0.6);
      heroGfx.drawCircle(54, 23, 5);
      heroGfx.drawCircle(66, 23, 5);
      heroGfx.endFill();

      // Pupils (black)
      heroGfx.beginFill(0x000000);
      heroGfx.drawCircle(54, 24, 3);
      heroGfx.drawCircle(66, 24, 3);
      heroGfx.endFill();

      // Eye shine (small highlight for realism)
      heroGfx.beginFill(0xffffff, 0.8);
      heroGfx.drawCircle(52, 22, 2);
      heroGfx.drawCircle(64, 22, 2);
      heroGfx.endFill();

      // Nose
      heroGfx.beginFill(darkSkinColor);
      heroGfx.drawCircle(60, 26, 3);
      heroGfx.endFill();

      // Mouth
      heroGfx.lineStyle(2, 0x000000);
      heroGfx.arc(60, 31, 5, 0, Math.PI);

      // ACCESSORIES/ARMOR OUTLINES
      // Shoulder armor
      heroGfx.lineStyle(3, darkerColor);
      heroGfx.drawCircle(32, 48, 18);
      heroGfx.drawCircle(88, 48, 18);

      // GLOW/OUTLINE (gives depth)
      heroGfx.lineStyle(4, brighterColor, 0.3);
      heroGfx.drawCircle(60, 65, 35);

      // HIGHLIGHT EDGE (top left)
      heroGfx.lineStyle(2, brighterColor, 0.5);
      heroGfx.arc(50, 50, 20, Math.PI, Math.PI * 1.5);

      this.textures[`hero_${colorName}`] = this.app.renderer.generateTexture(heroGfx, {
        region: new PIXI.Rectangle(0, 0, 160, 140),
      });
      heroGfx.destroy();
    });

    const monsterGfx = new PIXI.Graphics();
    
    // Shadow
    monsterGfx.beginFill(0x000000, 0.2);
    monsterGfx.drawEllipse(45, 58, 32, 10);
    monsterGfx.endFill();

    // Body main (brighter)
    monsterGfx.beginFill(0x4caf50);
    monsterGfx.drawCircle(45, 40, 28);
    monsterGfx.endFill();

    // Body darker bottom (3D effect)
    monsterGfx.beginFill(0x1b5e20, 0.7);
    monsterGfx.drawCircle(45, 50, 26);
    monsterGfx.endFill();

    // Body brighter top
    monsterGfx.beginFill(0x7cb342, 0.6);
    monsterGfx.drawCircle(38, 32, 18);
    monsterGfx.endFill();

    // Eyes with depth
    monsterGfx.beginFill(0xffeb3b);
    monsterGfx.drawCircle(35, 36, 7);
    monsterGfx.drawCircle(55, 36, 7);
    monsterGfx.endFill();

    // Eye shadow
    monsterGfx.beginFill(0xfbc02d, 0.5);
    monsterGfx.drawCircle(35, 40, 5);
    monsterGfx.drawCircle(55, 40, 5);
    monsterGfx.endFill();

    // Pupils
    monsterGfx.beginFill(0x000000);
    monsterGfx.drawCircle(35, 38, 4);
    monsterGfx.drawCircle(55, 38, 4);
    monsterGfx.endFill();

    // Eye shine
    monsterGfx.beginFill(0xffffff, 0.7);
    monsterGfx.drawCircle(33, 36, 2);
    monsterGfx.drawCircle(53, 36, 2);
    monsterGfx.endFill();

    // Mouth
    monsterGfx.lineStyle(2, 0x000000);
    monsterGfx.arc(45, 48, 6, 0, Math.PI);

    // Spikes (improved with shading)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = 45 + Math.cos(angle) * 32;
      const y = 40 + Math.sin(angle) * 32;
      
      // Spike base
      monsterGfx.beginFill(0x1b5e20);
      monsterGfx.drawPolygon([
        x, y,
        x + Math.cos(angle) * 10, y + Math.sin(angle) * 10,
        x + Math.cos(angle - Math.PI / 4) * 6, y + Math.sin(angle - Math.PI / 4) * 6,
      ]);
      monsterGfx.endFill();
      
      // Spike highlight
      monsterGfx.beginFill(0x558b2f, 0.5);
      monsterGfx.drawPolygon([
        x + Math.cos(angle) * 3, y + Math.sin(angle) * 3,
        x + Math.cos(angle) * 7, y + Math.sin(angle) * 7,
        x + Math.cos(angle - Math.PI / 6) * 3, y + Math.sin(angle - Math.PI / 6) * 3,
      ]);
      monsterGfx.endFill();
    }

    // Monster outline/glow
    monsterGfx.lineStyle(3, 0x7cb342, 0.3);
    monsterGfx.drawCircle(45, 40, 30);

    this.textures.monster = this.app.renderer.generateTexture(monsterGfx, {
      region: new PIXI.Rectangle(0, 0, 100, 100),
    });
    monsterGfx.destroy();

    const crateGfx = new PIXI.Graphics();
    crateGfx.beginFill(0x8b4513);
    crateGfx.drawRect(0, 0, 60, 60);
    crateGfx.endFill();

    crateGfx.lineStyle(3, 0x654321);
    crateGfx.moveTo(20, 0);
    crateGfx.lineTo(20, 60);
    crateGfx.moveTo(40, 0);
    crateGfx.lineTo(40, 60);
    crateGfx.moveTo(0, 20);
    crateGfx.lineTo(60, 20);
    crateGfx.moveTo(0, 40);
    crateGfx.lineTo(60, 40);

    crateGfx.beginFill(0xa0522d, 0.4);
    crateGfx.drawRect(0, 0, 60, 15);
    crateGfx.endFill();

    this.textures.crate = this.app.renderer.generateTexture(crateGfx);
    crateGfx.destroy();

    const stoneGfx = new PIXI.Graphics();
    stoneGfx.beginFill(0x90a4ae);
    stoneGfx.drawRect(0, 0, 60, 60);
    stoneGfx.endFill();

    for (let i = 0; i < 8; i++) {
      const x = Math.random() * 60;
      const y = Math.random() * 60;
      stoneGfx.beginFill(0x78909c, 0.5);
      stoneGfx.drawRect(x, y, Math.random() * 15 + 5, Math.random() * 15 + 5);
      stoneGfx.endFill();
    }

    stoneGfx.beginFill(0x455a64, 0.3);
    stoneGfx.drawRect(0, 0, 30, 60);
    stoneGfx.endFill();

    this.textures.stone = this.app.renderer.generateTexture(stoneGfx);
    stoneGfx.destroy();

    const barrelGfx = new PIXI.Graphics();
    barrelGfx.beginFill(0xcd5c5c);
    barrelGfx.drawCircle(30, 30, 25);
    barrelGfx.endFill();

    barrelGfx.beginFill(0x8b3a3a);
    barrelGfx.drawCircle(30, 38, 23);
    barrelGfx.endFill();

    barrelGfx.lineStyle(3, 0x2c2c2c);
    barrelGfx.drawEllipse(30, 20, 25, 8);
    barrelGfx.drawEllipse(30, 30, 25, 8);
    barrelGfx.drawEllipse(30, 40, 25, 8);

    this.textures.barrel = this.app.renderer.generateTexture(barrelGfx, {
      region: new PIXI.Rectangle(0, 0, 60, 60),
    });
    barrelGfx.destroy();

    const healthGfx = new PIXI.Graphics();
    healthGfx.beginFill(0xff6b6b);
    healthGfx.drawRect(5, 5, 40, 40);
    healthGfx.endFill();

    healthGfx.beginFill(0xff8787, 0.6);
    healthGfx.drawRect(5, 5, 40, 12);
    healthGfx.endFill();

    healthGfx.beginFill(0xffffff);
    healthGfx.drawRect(18, 12, 8, 26);
    healthGfx.drawRect(12, 18, 20, 8);
    healthGfx.endFill();

    this.textures.health = this.app.renderer.generateTexture(healthGfx, {
      region: new PIXI.Rectangle(0, 0, 50, 50),
    });
    healthGfx.destroy();

    const ammoGfx = new PIXI.Graphics();
    ammoGfx.beginFill(0xffd54f);
    ammoGfx.drawRect(5, 5, 40, 40);
    ammoGfx.endFill();

    ammoGfx.beginFill(0xffeb3b, 0.6);
    ammoGfx.drawRect(5, 5, 40, 12);
    ammoGfx.endFill();

    ammoGfx.beginFill(0x212121);
    ammoGfx.drawCircle(18, 20, 4);
    ammoGfx.drawCircle(32, 20, 4);
    ammoGfx.drawCircle(18, 32, 4);
    ammoGfx.drawCircle(32, 32, 4);
    ammoGfx.endFill();

    this.textures.ammo = this.app.renderer.generateTexture(ammoGfx, {
      region: new PIXI.Rectangle(0, 0, 50, 50),
    });
    ammoGfx.destroy();

    // Power-up star using manual polygon (no drawStar method exists)
    const powerupGfx = new PIXI.Graphics();
    const starPts = this.createStarPoints(25, 25, 5, 20, 10);
    powerupGfx.beginFill(0xe91e63);
    powerupGfx.drawPolygon(starPts);
    powerupGfx.endFill();

    const starPtsInner = this.createStarPoints(25, 25, 5, 18, 8);
    powerupGfx.beginFill(0xf06292, 0.6);
    powerupGfx.drawPolygon(starPtsInner);
    powerupGfx.endFill();

    this.textures.powerup = this.app.renderer.generateTexture(powerupGfx, {
      region: new PIXI.Rectangle(0, 0, 50, 50),
    });
    powerupGfx.destroy();

    const bulletGfx = new PIXI.Graphics();
    bulletGfx.beginFill(0xffeb3b);
    bulletGfx.drawCircle(8, 8, 6);
    bulletGfx.endFill();

    bulletGfx.lineStyle(2, 0xfdd835, 0.6);
    bulletGfx.drawCircle(8, 8, 8);

    this.textures.bullet = this.app.renderer.generateTexture(bulletGfx, {
      region: new PIXI.Rectangle(0, 0, 16, 16),
    });
    bulletGfx.destroy();
  }

  buildMap(mapData) {
    this.layers.wallLayer.removeChildren();
    if (!mapData || !mapData.walls) return;

    mapData.walls.forEach((wall) => {
      const width = wall.maxX - wall.minX;
      const height = wall.maxY - wall.minY;
      let texture = this.textures.crate;
      if (Math.random() > 0.6) texture = this.textures.stone;
      if (Math.random() > 0.8) texture = this.textures.barrel;

      const sprite = new PIXI.Sprite(texture);
      sprite.x = wall.minX;
      sprite.y = wall.minY;
      sprite.width = width;
      sprite.height = height;
      this.layers.wallLayer.addChild(sprite);
    });
  }

  setState(newState) {
    this.gameState = newState;

    if (newState.map) {
      this.mapWidth = newState.map.width || 1024;
      this.mapHeight = newState.map.height || 768;
      this.buildMap(newState.map);
    }

    if (newState.players) {
      Object.entries(newState.players).forEach(([playerId, player]) => {
        if (!this.sprites.players[playerId]) {
          const heroTexture = this.textures[`hero_${player.hero || 'red'}`] || this.textures.hero_red;
          const sprite = new PIXI.Sprite(heroTexture);
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(0.8);
          this.layers.playerLayer.addChild(sprite);
          this.sprites.players[playerId] = sprite;
        }

        const sprite = this.sprites.players[playerId];
        sprite.x = player.x;
        sprite.y = player.y;
        sprite.rotation = player.rotation || 0;

        if (!sprite.healthBar) {
          const bar = new PIXI.Container();
          const bg = new PIXI.Graphics();
          bg.beginFill(0x000000);
          bg.drawRect(0, 0, 50, 6);
          bg.endFill();
          bar.addChild(bg);

          const health = new PIXI.Graphics();
          health.beginFill(0x4caf50);
          health.drawRect(0, 0, 50, 6);
          health.endFill();
          bar.addChild(health);

          health.name = 'healthFill';
          bar.x = -25;
          bar.y = -60;
          sprite.addChild(bar);
          sprite.healthBar = bar;
        }

        if (sprite.healthBar) {
          const maxHealth = player.maxLives || 100;
          const currentHealth = player.lives || 100;
          const healthFill = sprite.healthBar.getChildByName('healthFill');
          if (healthFill) healthFill.scale.x = Math.max(0, currentHealth / maxHealth);
        }

        if (playerId === this.localPlayerId && !sprite.selectionRing) {
          const ring = new PIXI.Graphics();
          ring.lineStyle(3, 0xffeb3b);
          ring.drawCircle(0, 0, 65);
          sprite.addChild(ring);
          sprite.selectionRing = ring;
        }
      });

      Object.keys(this.sprites.players).forEach((playerId) => {
        if (!newState.players[playerId]) {
          this.sprites.players[playerId].destroy();
          delete this.sprites.players[playerId];
        }
      });
    }

    if (newState.monsters) {
      Object.entries(newState.monsters).forEach(([monsterId, monster]) => {
        if (!this.sprites.monsters[monsterId]) {
          const sprite = new PIXI.Sprite(this.textures.monster);
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(0.6);
          this.layers.monsterLayer.addChild(sprite);
          this.sprites.monsters[monsterId] = sprite;
        }

        const sprite = this.sprites.monsters[monsterId];
        sprite.x = monster.x;
        sprite.y = monster.y;
        sprite.rotation = monster.rotation || 0;

        if (!sprite.healthBar) {
          const bar = new PIXI.Container();
          const bg = new PIXI.Graphics();
          bg.beginFill(0x000000);
          bg.drawRect(0, 0, 40, 5);
          bg.endFill();
          bar.addChild(bg);

          const health = new PIXI.Graphics();
          health.beginFill(0xff6b6b);
          health.drawRect(0, 0, 40, 5);
          health.endFill();
          bar.addChild(health);

          health.name = 'healthFill';
          bar.x = -20;
          bar.y = -45;
          sprite.addChild(bar);
          sprite.healthBar = bar;
        }

        if (sprite.healthBar && monster.maxLives) {
          const healthFill = sprite.healthBar.getChildByName('healthFill');
          if (healthFill) healthFill.scale.x = Math.max(0, (monster.lives || monster.maxLives) / monster.maxLives);
        }
      });

      Object.keys(this.sprites.monsters).forEach((monsterId) => {
        if (!newState.monsters[monsterId]) {
          this.sprites.monsters[monsterId].destroy();
          delete this.sprites.monsters[monsterId];
        }
      });
    }

    if (newState.props && Array.isArray(newState.props)) {
      newState.props.forEach((prop, index) => {
        const propId = `prop_${index}`;
        if (!this.sprites.props[propId]) {
          let texture = this.textures.health;
          if (prop.type === 'ammo') texture = this.textures.ammo;
          if (prop.type === 'powerup') texture = this.textures.powerup;

          const sprite = new PIXI.Sprite(texture);
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(1.3);
          this.layers.propLayer.addChild(sprite);
          this.sprites.props[propId] = sprite;
        }

        const sprite = this.sprites.props[propId];
        sprite.x = prop.x;
        sprite.y = prop.y;

        if (!sprite.animationTime) sprite.animationTime = 0;
        sprite.animationTime += 0.02;
        sprite.y += Math.sin(sprite.animationTime) * 0.5;
        sprite.rotation += 0.02;
      });
    }

    if (newState.bullets && Array.isArray(newState.bullets)) {
      newState.bullets.forEach((bullet, index) => {
        const bulletId = `bullet_${index}`;
        if (!this.sprites.bullets[bulletId]) {
          const sprite = new PIXI.Sprite(this.textures.bullet);
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(2);
          this.layers.bulletLayer.addChild(sprite);
          this.sprites.bullets[bulletId] = sprite;
        }

        const sprite = this.sprites.bullets[bulletId];
        sprite.x = bullet.x;
        sprite.y = bullet.y;
        sprite.rotation = bullet.rotation || 0;
      });

      Object.keys(this.sprites.bullets).forEach((bulletId, index) => {
        if (!newState.bullets[index]) {
          this.sprites.bullets[bulletId].destroy();
          delete this.sprites.bullets[bulletId];
        }
      });
    }
  }

  setLocalPlayerId(playerId) {
    this.localPlayerId = playerId;
  }

  render() {
    if (!this.gameState || !this.gameState.players) {
      this.app.render();
      return;
    }

    if (this.layers.floorLayer.children.length === 0) {
      const floorSprite = new PIXI.TilingSprite(
        this.textures.floor,
        this.mapWidth,
        this.mapHeight
      );
      floorSprite.x = 0;
      floorSprite.y = 0;
      this.layers.floorLayer.addChild(floorSprite);
    }

    const localPlayer = this.gameState.players[this.localPlayerId];
    if (localPlayer) {
      const targetX = localPlayer.x;
      const targetY = localPlayer.y;

      this.cameraX += (targetX - this.cameraX) * this.cameraSmooth;
      this.cameraY += (targetY - this.cameraY) * this.cameraSmooth;

      const minCameraX = Math.max(0, this.cameraX - (this.width / 2) / this.zoom);
      const maxCameraX = Math.min(this.mapWidth, this.cameraX + (this.width / 2) / this.zoom);
      const minCameraY = Math.max(0, this.cameraY - (this.height / 2) / this.zoom);
      const maxCameraY = Math.min(this.mapHeight, this.cameraY + (this.height / 2) / this.zoom);

      const clampedX = (minCameraX + maxCameraX) / 2;
      const clampedY = (minCameraY + maxCameraY) / 2;

      this.app.stage.scale.set(this.zoom, this.zoom);
      this.app.stage.pivot.x = clampedX;
      this.app.stage.pivot.y = clampedY;
      this.app.stage.position.x = this.width / 2;
      this.app.stage.position.y = this.height / 2;
    }

    const allSprites = [
      ...this.layers.playerLayer.children,
      ...this.layers.monsterLayer.children,
      ...this.layers.propLayer.children,
    ];

    allSprites.sort((a, b) => {
      const aY = a.y + (a.height || 0) / 2;
      const bY = b.y + (b.height || 0) / 2;
      return aY - bY;
    });

    this.app.render();
  }

  destroy() {
    Object.values(this.textures).forEach((texture) => {
      if (texture && texture.destroy) texture.destroy();
    });
    this.app.destroy();
  }
}
