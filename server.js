const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cards = require("./cards.json");

const ENERGY_MAX = 100;
const ENERGY_PER_TURN = 20;
const SPECIAL_COST = 100;
const ULTIMATE_TURNS = 4;
const CRITICAL_CHANCE = 0.15;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static(__dirname));

io.on("connection", (socket) => {
  socket.on("create-room", () => {
    const roomCode = createRoomCode();
    rooms.set(roomCode, createEmptyRoom());
    joinRoom(socket, roomCode);
    socket.emit("room-created", { roomCode, playerNumber: 1 });
  });

  socket.on("join-room", (roomCode) => {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(normalizedCode);

    if (!room) {
      socket.emit("room-error", "Sala nao encontrada.");
      return;
    }

    if (room.players.player1.socketId && room.players.player2.socketId) {
      socket.emit("room-error", "Sala cheia.");
      return;
    }

    const playerNumber = joinRoom(socket, normalizedCode);
    socket.emit("joined-room", { roomCode: normalizedCode, playerNumber });
    socket.to(normalizedCode).emit("opponent-joined");
  });

  socket.on("select-card", ({ roomCode, cardId }) => {
    const room = rooms.get(roomCode);
    const playerKey = getPlayerKey(room, socket.id);
    const card = findCard(cardId);

    if (!room || !playerKey || !card) {
      return;
    }

    room.players[playerKey] = {
      ...room.players[playerKey],
      cardId,
      hp: card.hp,
      energy: 0,
      turns: 0,
      defending: false,
      ultimateUsed: false
    };

    if (room.players.player1.cardId && room.players.player2.cardId) {
      room.turn = getFirstTurn(room);
      beginTurn(room, room.turn);
      room.log = "As duas cartas entraram na arena. Energia inicial carregada.";
    } else {
      room.log = "Aguardando oponente escolher carta.";
    }

    emitBattleState(roomCode);
  });

  socket.on("player-action", ({ roomCode, type }) => {
    const room = rooms.get(roomCode);
    const playerKey = getPlayerKey(room, socket.id);

    if (!room || !playerKey || room.turn !== playerKey || room.winner) {
      return;
    }

    if (!canUseAction(room.players[playerKey], type)) {
      socket.emit("room-error", "Acao indisponivel agora.");
      return;
    }

    const defenderKey = playerKey === "player1" ? "player2" : "player1";
    const action = resolveAction(room.players[playerKey], room.players[defenderKey], type);
    room.lastAction = { actor: playerKey, ...action };
    room.log = action.message;

    if (room.players[defenderKey].hp <= 0) {
      const attackerCard = findCard(room.players[playerKey].cardId);
      room.winner = playerKey;
      room.log = `${attackerCard.nome} encerrou o combate.`;
    } else {
      room.turn = defenderKey;
      beginTurn(room, defenderKey);
    }

    emitBattleState(roomCode);
  });

  socket.on("leave-room", (roomCode) => leaveRoom(socket, roomCode));
  socket.on("disconnect", () => leaveAllRooms(socket));
});

function createEmptyRoom() {
  return {
    players: {
      player1: createEmptyPlayer(),
      player2: createEmptyPlayer()
    },
    turn: "player1",
    winner: "",
    log: "",
    lastAction: null
  };
}

function createEmptyPlayer() {
  return {
    socketId: "",
    cardId: "",
    hp: 0,
    energy: 0,
    turns: 0,
    defending: false,
    ultimateUsed: false
  };
}

function joinRoom(socket, roomCode) {
  const room = rooms.get(roomCode);
  const playerKey = room.players.player1.socketId ? "player2" : "player1";
  room.players[playerKey].socketId = socket.id;
  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  socket.data.playerKey = playerKey;
  return playerKey === "player1" ? 1 : 2;
}

function leaveRoom(socket, roomCode) {
  const room = rooms.get(roomCode);

  if (!room) {
    return;
  }

  const playerKey = getPlayerKey(room, socket.id);
  if (playerKey) {
    room.players[playerKey] = createEmptyPlayer();
  }

  socket.leave(roomCode);
  socket.to(roomCode).emit("opponent-left");

  if (!room.players.player1.socketId && !room.players.player2.socketId) {
    rooms.delete(roomCode);
  }
}

function leaveAllRooms(socket) {
  if (socket.data.roomCode) {
    leaveRoom(socket, socket.data.roomCode);
  }
}

function emitBattleState(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit("battle-state", room);
    room.lastAction = null;
  }
}

function getPlayerKey(room, socketId) {
  if (!room) {
    return "";
  }

  if (room.players.player1.socketId === socketId) {
    return "player1";
  }

  if (room.players.player2.socketId === socketId) {
    return "player2";
  }

  return "";
}

function getFirstTurn(room) {
  const player1Card = findCard(room.players.player1.cardId);
  const player2Card = findCard(room.players.player2.cardId);
  return player1Card.velocidade >= player2Card.velocidade ? "player1" : "player2";
}

function beginTurn(room, playerKey) {
  const player = room.players[playerKey];
  player.turns += 1;
  player.energy = Math.min(ENERGY_MAX, player.energy + ENERGY_PER_TURN);
}

function canUseAction(player, type) {
  if (!player?.cardId) {
    return false;
  }

  if (type === "special") {
    return player.energy >= SPECIAL_COST;
  }

  if (type === "ultimate") {
    return player.turns >= ULTIMATE_TURNS && !player.ultimateUsed;
  }

  return ["basic", "defend"].includes(type);
}

function resolveAction(attacker, defender, type) {
  const attackerCard = findCard(attacker.cardId);
  const defenderCard = findCard(defender.cardId);

  if (type === "defend") {
    attacker.defending = true;
    return {
      type,
      damage: 0,
      critical: false,
      defended: false,
      message: `${attackerCard.nome} ativou defesa e reduzira o proximo dano.`
    };
  }

  if (type === "special") {
    attacker.energy = Math.max(0, attacker.energy - SPECIAL_COST);
  }

  if (type === "ultimate") {
    attacker.ultimateUsed = true;
  }

  const critical = Math.random() < CRITICAL_CHANCE;
  const rawDamage = Math.round(attackerCard.ataque * getActionMultiplier(type));
  const mitigated = Math.max(6, rawDamage - Math.round(defenderCard.defesa * 0.42));
  let damage = Math.max(4, mitigated);

  if (critical) {
    damage *= 2;
  }

  const defended = defender.defending;
  if (defended) {
    damage = Math.ceil(damage * 0.5);
    defender.defending = false;
  }

  defender.hp = Math.max(0, defender.hp - damage);

  return {
    type,
    damage,
    critical,
    defended,
    message: buildDamageMessage(attackerCard, type, damage, critical, defended)
  };
}

function getActionMultiplier(type) {
  if (type === "ultimate") {
    return 2.85;
  }

  if (type === "special") {
    return 1.7;
  }

  return 1;
}

function buildDamageMessage(card, type, damage, critical, defended) {
  const move = type === "ultimate" ? "PROTOCOLO OMEGA" : type === "special" ? card.especial : "ataque basico";
  const criticalText = critical ? " CRÍTICO!" : "";
  const defenseText = defended ? " A defesa cortou metade do dano." : "";
  return `${card.nome} usou ${move} e causou ${damage} de dano.${criticalText}${defenseText}`;
}

function findCard(cardId) {
  return cards.find((card) => card.id === cardId);
}

function createRoomCode() {
  let code = "";

  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(code));

  return code;
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Neon Card Clash rodando em http://localhost:${port}`);
});
