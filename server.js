const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cards = require("./cards.json");

const ENERGY_MAX = 100;
const ENERGY_PER_TURN = 20;
const SPECIAL_COST = 100;
const ULTIMATE_COST = 100;
const ULTIMATE_TURNS = 4;
const BASE_CRITICAL_CHANCE = 0.15;

const BALANCE = {
  power: {
    attackReference: 30,
    attackStep: 0.012,
    minAttackFactor: 0.88,
    maxAttackFactor: 1.1,
    defenseReference: 18,
    defenseStep: 0.012,
    minDefenseFactor: 0.86,
    maxDefenseFactor: 1.05,
    minimumDamage: 1
  },
  actions: {
    basic: { hpRatio: 0.11, maxHpRatio: 0.16 },
    special: { hpRatio: 0.245, maxHpRatio: 0.29 },
    ultimate: { hpRatio: 0.36, maxHpRatio: 0.48 }
  },
  passives: {
    omegaReduction: 0.94,
    tecnoCoreReduction: 0.98,
    infernaSpecialBonus: 1.04,
    emberMissingHpBonus: 0.24,
    markedBonus: 1.14
  },
  dots: {
    bleed: 3,
    intenseBurn: 5,
    counterBurn: 3,
    ultimateBurn: 6
  },
  shields: {
    nexusSpecial: 18,
    sentinelDefend: 18,
    tecnoCoreDefend: 8
  }
};

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
    if (!room) return socket.emit("room-error", "Sala nao encontrada.");
    if (room.players.player1.socketId && room.players.player2.socketId) return socket.emit("room-error", "Sala cheia.");

    const playerNumber = joinRoom(socket, normalizedCode);
    socket.emit("joined-room", { roomCode: normalizedCode, playerNumber });
    socket.to(normalizedCode).emit("opponent-joined");
  });

  socket.on("select-card", ({ roomCode, cardId }) => {
    const room = rooms.get(roomCode);
    const playerKey = getPlayerKey(room, socket.id);
    const card = findCard(cardId);
    if (!room || !playerKey || !card) return;

    room.players[playerKey] = {
      ...room.players[playerKey],
      cardId,
      hp: card.hp,
      energy: 0,
      turns: 0,
      defending: false,
      ultimateUsed: false,
      statuses: {}
    };

    if (room.players.player1.cardId && room.players.player2.cardId) {
      room.turn = getFirstTurn(room);
      const events = beginTurn(room, room.turn);
      room.log = events.length ? events.join(" ") : "As duas cartas entraram na arena.";
    } else {
      room.log = "Aguardando oponente escolher carta.";
    }

    emitBattleState(roomCode);
  });

  socket.on("player-action", ({ roomCode, type }) => {
    const room = rooms.get(roomCode);
    const playerKey = getPlayerKey(room, socket.id);
    if (!room || !playerKey || room.turn !== playerKey || room.winner) return;
    if (!canUseAction(room.players[playerKey], type)) return socket.emit("room-error", "Acao indisponivel agora.");

    const defenderKey = playerKey === "player1" ? "player2" : "player1";
    const action = resolveAction(room.players[playerKey], room.players[defenderKey], type);
    room.lastAction = { actor: playerKey, ...action };
    room.log = action.message;

    if (room.players[defenderKey].hp <= 0) {
      room.winner = playerKey;
      room.log = `${findCard(room.players[playerKey].cardId).nome} encerrou o combate.`;
    } else {
      room.turn = defenderKey;
      const events = beginTurn(room, defenderKey);
      if (room.players[defenderKey].hp <= 0) {
        room.winner = playerKey;
      }
      if (events.length) room.log = `${room.log} ${events.join(" ")}`;
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
    ultimateUsed: false,
    statuses: {}
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
  if (!room) return;
  const playerKey = getPlayerKey(room, socket.id);
  if (playerKey) room.players[playerKey] = createEmptyPlayer();
  socket.leave(roomCode);
  socket.to(roomCode).emit("opponent-left");
  if (!room.players.player1.socketId && !room.players.player2.socketId) rooms.delete(roomCode);
}

function leaveAllRooms(socket) {
  if (socket.data.roomCode) leaveRoom(socket, socket.data.roomCode);
}

function emitBattleState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("battle-state", room);
  room.lastAction = null;
}

function getPlayerKey(room, socketId) {
  if (!room) return "";
  if (room.players.player1.socketId === socketId) return "player1";
  if (room.players.player2.socketId === socketId) return "player2";
  return "";
}

function getFirstTurn(room) {
  const player1Card = findCard(room.players.player1.cardId);
  const player2Card = findCard(room.players.player2.cardId);
  return player1Card.velocidade >= player2Card.velocidade ? "player1" : "player2";
}

function beginTurn(room, playerKey) {
  const player = room.players[playerKey];
  const card = findCard(player.cardId);
  const events = [];
  player.turns += 1;
  events.push(...applyTurnStatuses(player));
  if (card.id === "ember-queen" && player.hp <= card.hp * 0.45) {
    addStatus(player, "attackBuff", { turns: 1, power: 0.18 });
    events.push(`${card.nome} entrou em furia: ataque aumentado.`);
  }
  player.energy = Math.min(ENERGY_MAX, player.energy + ENERGY_PER_TURN + (card.id === "zero-mask" ? 15 : 0));
  if (hasStatus(player.statuses, "stun")) {
    player.statuses.stun.turns -= 1;
    events.push(`${card.nome} perdeu o turno por STUN.`);
    room.turn = playerKey === "player1" ? "player2" : "player1";
  }
  return events;
}

function applyTurnStatuses(player) {
  const card = findCard(player.cardId);
  const events = [];
  const burn = player.statuses.burn;
  const bleed = player.statuses.bleed;
  const drain = player.statuses.drained;
  if (burn?.turns > 0) {
    player.hp = Math.max(0, player.hp - burn.power);
    burn.turns -= 1;
    events.push(`${card.nome} sofreu ${burn.power} de queimadura.`);
  }
  if (bleed?.turns > 0) {
    player.hp = Math.max(0, player.hp - bleed.power);
    bleed.turns -= 1;
    events.push(`${card.nome} sangrou ${bleed.power}.`);
  }
  if (drain?.turns > 0) {
    player.energy = Math.max(0, player.energy - drain.power);
    drain.turns -= 1;
    events.push(`${card.nome} perdeu energia.`);
  }
  tickStatus(player, "shield");
  tickStatus(player, "attackBuff");
  tickStatus(player, "defenseBuff");
  tickStatus(player, "marked");
  tickStatus(player, "evasion");
  return events;
}

function canUseAction(player, type) {
  if (!player?.cardId) return false;
  if (type === "special") return player.energy >= SPECIAL_COST;
  if (type === "ultimate") return player.energy >= ULTIMATE_COST && player.turns >= ULTIMATE_TURNS && !player.ultimateUsed;
  return ["basic", "defend"].includes(type);
}

function resolveAction(attacker, defender, type) {
  const attackerCard = findCard(attacker.cardId);
  const defenderCard = findCard(defender.cardId);

  if (type === "defend") {
    attacker.defending = true;
    addStatus(attacker, "defenseBuff", { turns: 1, power: 0.2 });
    if (attackerCard.id === "rx-sentinel") addShield(attacker, BALANCE.shields.sentinelDefend, 2);
    if (attackerCard.faccao === "TecnoCore") addShield(attacker, BALANCE.shields.tecnoCoreDefend, 1);
    return { type, damage: 0, critical: false, defended: false, message: `${attackerCard.nome} levantou defesa.` };
  }

  if (tryEvade(defender, defenderCard)) {
    return { type, damage: 0, evaded: true, critical: false, defended: false, message: `${defenderCard.nome} DESVIOU do ataque.` };
  }

  spendEnergy(attacker, type);
  const critical = Math.random() < getCriticalChance(attacker, attackerCard, type);
  let damage = calculateDamage(attacker, defender, attackerCard, defenderCard, type, critical);
  const shielded = absorbShield(defender, damage);
  damage = shielded.remainingDamage;
  const defended = defender.defending;
  if (defended) {
    damage = Math.ceil(damage * 0.5);
    defender.defending = false;
  }
  defender.hp = Math.max(0, defender.hp - damage);
  applyPostAttackPassives(attacker, defender, attackerCard, defenderCard, type, damage);
  applyCounterPassives(attacker, defender, attackerCard, defenderCard, damage);

  return {
    type,
    damage,
    critical,
    defended,
    evaded: false,
    blocked: shielded.blocked,
    message: buildDamageMessage(attackerCard, type, damage, critical, defended, shielded.blocked)
  };
}

function calculateDamage(attacker, defender, attackerCard, defenderCard, type, critical) {
  const actionBalance = BALANCE.actions[type] || BALANCE.actions.basic;
  const attackFactor = clamp(
    1 + ((attackerCard.ataque - BALANCE.power.attackReference) * BALANCE.power.attackStep),
    BALANCE.power.minAttackFactor,
    BALANCE.power.maxAttackFactor
  );
  const defenseFactor = clamp(
    1 - ((defenderCard.defesa - BALANCE.power.defenseReference) * BALANCE.power.defenseStep),
    BALANCE.power.minDefenseFactor,
    BALANCE.power.maxDefenseFactor
  );

  let modifier = attackFactor * defenseFactor;
  if (hasStatus(attacker.statuses, "attackBuff")) modifier *= 1 + attacker.statuses.attackBuff.power;
  if (hasStatus(defender.statuses, "defenseBuff")) modifier *= 1 - defender.statuses.defenseBuff.power;
  if (hasStatus(defender.statuses, "marked")) modifier *= BALANCE.passives.markedBonus;
  if (attackerCard.id === "ember-queen") modifier *= 1 + ((1 - attacker.hp / attackerCard.hp) * BALANCE.passives.emberMissingHpBonus);
  if (attackerCard.faccao === "Inferna" && type !== "basic") modifier *= BALANCE.passives.infernaSpecialBonus;
  if (defenderCard.id === "omega-titan") modifier *= BALANCE.passives.omegaReduction;
  if (defenderCard.faccao === "TecnoCore") modifier *= BALANCE.passives.tecnoCoreReduction;

  let damage = Math.round(defenderCard.hp * actionBalance.hpRatio * modifier);
  if (critical) damage *= 2;

  const cap = Math.round(defenderCard.hp * actionBalance.maxHpRatio);
  return clamp(damage, BALANCE.power.minimumDamage, Math.max(BALANCE.power.minimumDamage, cap));
}

function applyPostAttackPassives(attacker, defender, attackerCard, defenderCard, type, damage) {
  if (damage <= 0) return;
  if (attackerCard.id === "crimson") addStatus(defender, "bleed", { turns: 3, power: BALANCE.dots.bleed });
  if (attackerCard.id === "raven-exe") stealEnergy(attacker, defender, 18);
  if (attackerCard.id === "nexus-9" && type === "special") addShield(attacker, BALANCE.shields.nexusSpecial, 2);
  if (attackerCard.id === "solaris" && type !== "basic") addStatus(defender, "burn", { turns: 3, power: BALANCE.dots.intenseBurn });
  if (attackerCard.id === "omega-titan" && type === "ultimate") addStatus(defender, "stun", { turns: 1, power: 1 });
  if (attackerCard.id === "vulkar" && type === "ultimate") addStatus(defender, "stun", { turns: 1, power: 1 });
  if (attackerCard.id === "byte-hunter" && type === "basic" && Math.random() < 0.35) addStatus(defender, "marked", { turns: 1, power: 0.22 });
  if (attackerCard.id === "zero-mask" && type === "special") addStatus(attacker, "evasion", { turns: 1, power: 0.2 });
  if (attackerCard.faccao === "Inferna" && type === "ultimate") addStatus(defender, "burn", { turns: 2, power: BALANCE.dots.ultimateBurn });
  if (attackerCard.faccao === "ShadowByte" && type === "special") stealEnergy(attacker, defender, 8);
}

function applyCounterPassives(attacker, defender, attackerCard, defenderCard, damage) {
  if (damage > 0 && defenderCard.id === "vulkar" && Math.random() < 0.35) addStatus(attacker, "burn", { turns: 2, power: BALANCE.dots.counterBurn });
}

function tryEvade(defender, defenderCard) {
  let chance = 0;
  if (defenderCard.id === "ghost-link") chance += 0.15;
  if (defenderCard.faccao === "ShadowByte") chance += 0.04;
  if (hasStatus(defender.statuses, "evasion")) chance += defender.statuses.evasion.power;
  return Math.random() < chance;
}

function getCriticalChance(attacker, attackerCard, type) {
  let chance = BASE_CRITICAL_CHANCE;
  if (attackerCard.id === "cyber-shade") chance += 0.2;
  if (attackerCard.faccao === "ShadowByte") chance += 0.06;
  if (type === "ultimate") chance += 0.12;
  return chance;
}

function spendEnergy(attacker, type) {
  if (type === "special") attacker.energy = Math.max(0, attacker.energy - SPECIAL_COST);
  if (type === "ultimate") {
    attacker.energy = Math.max(0, attacker.energy - ULTIMATE_COST);
    attacker.ultimateUsed = true;
  }
}

function getActionMultiplier(type) {
  if (type === "ultimate") return 3.1;
  if (type === "special") return 1.75;
  return 1;
}

function addStatus(player, key, value) {
  player.statuses[key] = { ...(player.statuses[key] || {}), ...value };
}

function addShield(player, amount, turns) {
  player.statuses.shield = { amount: (player.statuses.shield?.amount || 0) + amount, turns };
}

function absorbShield(defender, damage) {
  const shield = defender.statuses.shield;
  if (!shield?.amount) return { blocked: 0, remainingDamage: damage };
  const blocked = Math.min(shield.amount, damage);
  shield.amount -= blocked;
  return { blocked, remainingDamage: damage - blocked };
}

function stealEnergy(attacker, defender, amount) {
  const stolen = Math.min(amount, defender.energy);
  defender.energy -= stolen;
  attacker.energy = Math.min(ENERGY_MAX, attacker.energy + stolen);
  addStatus(defender, "drained", { turns: 1, power: 5 });
}

function tickStatus(player, key) {
  const status = player.statuses[key];
  if (!status) return;
  if (status.turns > 0) status.turns -= 1;
  if (status.turns <= 0 || status.amount <= 0) delete player.statuses[key];
}

function hasStatus(statuses, key) {
  const status = statuses?.[key];
  return Boolean(status && ((status.turns ?? 0) > 0 || (status.amount ?? 0) > 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildDamageMessage(card, type, damage, critical, defended, blocked) {
  const move = type === "ultimate" ? "PROTOCOLO OMEGA" : type === "special" ? card.especial : "ataque basico";
  const tags = [critical ? "CRÍTICO!" : "", defended ? "BLOQUEADO!" : "", blocked ? `ESCUDO absorveu ${blocked}.` : ""].filter(Boolean).join(" ");
  return `${card.nome} usou ${move} e causou ${damage} de dano. ${tags}`.trim();
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
