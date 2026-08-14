const ENERGY_MAX = 100;
const ENERGY_PER_TURN = 20;
const SPECIAL_COST = 100;
const ULTIMATE_COST = 100;
const ULTIMATE_TURNS = 4;
const BASE_CRITICAL_CHANCE = 0.15;

const SOUND_FILES = {
  click: "sounds/click.mp3",
  attack: "sounds/attack.mp3",
  special: "sounds/special.mp3",
  ultimate: "sounds/ultimate.mp3",
  victory: "sounds/victory.mp3",
  defeat: "sounds/defeat.mp3"
};

const audioCache = {};

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
    burn: 4,
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

const PASSIVES = {
  "crimson": { name: "Sangramento", hint: "Ataques aplicam sangramento por 3 turnos." },
  "ghost-link": { name: "Evasao Fantasma", hint: "15% de chance de desviar de ataques." },
  "omega-titan": { name: "Armadura Pesada", hint: "Reduz dano recebido." },
  "raven-exe": { name: "Hack Neural", hint: "Rouba energia ao causar dano." },
  "ember-queen": { name: "Chamas Crescentes", hint: "Menos HP significa mais dano." },
  "cyber-shade": { name: "Execucao Sombria", hint: "Chance de critico aumentada." },
  "nexus-9": { name: "Escudo Tecnologico", hint: "Especial concede escudo." },
  "zero-mask": { name: "Sobrecarga", hint: "Ganha energia extra por turno." },
  "byte-hunter": { name: "Marcador de Alvo", hint: "Basicos podem amplificar o proximo dano." },
  "rx-sentinel": { name: "Bastiao Reativo", hint: "Defender tambem concede escudo." },
  "solaris": { name: "Nucleo Solar", hint: "Especial aplica queimadura intensa." },
  "vulkar": { name: "Corpo Vulcanico", hint: "Pode queimar quem o ataca." }
};

const STATUS_META = {
  burn: { label: "Queimadura", className: "status-burn" },
  bleed: { label: "Sangramento", className: "status-bleed" },
  shield: { label: "Escudo", className: "status-shield" },
  stun: { label: "Stun", className: "status-stun" },
  drained: { label: "Drenado", className: "status-drained" },
  evasion: { label: "Evasao", className: "status-evasion" },
  attackBuff: { label: "Ataque+", className: "status-attack" },
  defenseBuff: { label: "Defesa+", className: "status-defense" },
  marked: { label: "Marcado", className: "status-marked" }
};

const FACTION_BONUS = {
  "TecnoCore": "Defesa, escudo e resistencia.",
  "Inferna": "Dano, queimadura e agressividade.",
  "ShadowByte": "Critico, evasao, hack e energia."
};

const state = {
  cards: [],
  mode: "cpu",
  socket: null,
  roomCode: "",
  playerNumber: 0,
  selectedCardId: "",
  player: null,
  enemy: null,
  currentTurn: "player",
  battleOver: false,
  soundEnabled: true
};

const screens = {
  menu: document.querySelector("#menu-screen"),
  online: document.querySelector("#online-screen"),
  select: document.querySelector("#select-screen"),
  battle: document.querySelector("#battle-screen")
};

const elements = {
  cardList: document.querySelector("#card-list"),
  modeLabel: document.querySelector("#mode-label"),
  battleMode: document.querySelector("#battle-mode"),
  turnMessage: document.querySelector("#turn-message"),
  playerFighter: document.querySelector("#player-fighter"),
  enemyFighter: document.querySelector("#enemy-fighter"),
  enemyLabel: document.querySelector("#enemy-label"),
  battleLog: document.querySelector("#battle-log"),
  basicAttack: document.querySelector("#basic-attack"),
  specialAttack: document.querySelector("#special-attack"),
  defendAction: document.querySelector("#defend-action"),
  ultimateAttack: document.querySelector("#ultimate-attack"),
  restartCpu: document.querySelector("#restart-cpu"),
  damageLayer: document.querySelector("#damage-layer"),
  resultModal: document.querySelector("#result-modal"),
  resultTitle: document.querySelector("#result-title"),
  resultText: document.querySelector("#result-text"),
  resultRematch: document.querySelector("#result-rematch"),
  resultMenu: document.querySelector("#result-menu"),
  soundToggle: document.querySelector("#sound-toggle"),
  createdRoom: document.querySelector("#created-room"),
  onlineStatus: document.querySelector("#online-status"),
  roomCode: document.querySelector("#room-code")
};

const rarityColors = {
  "Comum": "var(--rare-comum)",
  "Raro": "var(--rare-raro)",
  "Epico": "var(--rare-epico)",
  "Lendario": "var(--rare-lendario)"
};

async function init() {
  state.cards = await loadCards();
  bindEvents();
  renderCardSelection();
}

async function loadCards() {
  const response = await fetch("cards.json");
  if (!response.ok) throw new Error("Nao foi possivel carregar cards.json.");
  return response.json();
}

function bindEvents() {
  document.querySelector("#cpu-mode").addEventListener("click", () => startMode("cpu"));
  document.querySelector("#online-mode").addEventListener("click", openOnlineMenu);
  document.querySelector("#create-room").addEventListener("click", createRoom);
  document.querySelector("#join-room").addEventListener("click", joinRoom);
  document.querySelector("#leave-battle").addEventListener("click", returnToMenu);
  document.querySelectorAll("[data-back-menu]").forEach((button) => button.addEventListener("click", returnToMenu));
  elements.basicAttack.addEventListener("click", () => playerAction("basic"));
  elements.specialAttack.addEventListener("click", () => playerAction("special"));
  elements.defendAction.addEventListener("click", () => playerAction("defend"));
  elements.ultimateAttack.addEventListener("click", () => playerAction("ultimate"));
  elements.restartCpu.addEventListener("click", () => startMode(state.mode));
  elements.resultRematch.addEventListener("click", startResultRematch);
  elements.resultMenu.addEventListener("click", closeResult);
  elements.soundToggle.addEventListener("click", toggleSound);
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function startMode(mode) {
  state.mode = mode;
  state.selectedCardId = "";
  state.player = null;
  state.enemy = null;
  state.battleOver = false;
  clearBattleBackdrop();
  elements.modeLabel.textContent = mode === "cpu" ? "Modo CPU" : `Online ${state.roomCode}`;
  renderCardSelection();
  showScreen("select");
}

function openOnlineMenu() {
  setupSocket();
  showScreen("online");
}

function setupSocket() {
  if (state.socket || typeof io === "undefined") {
    if (typeof io === "undefined") elements.onlineStatus.textContent = "Socket.IO indisponivel. Rode o projeto com npm start.";
    return;
  }

  state.socket = io();
  state.socket.on("room-created", ({ roomCode, playerNumber }) => {
    state.roomCode = roomCode;
    state.playerNumber = playerNumber;
    elements.createdRoom.textContent = `Sala criada: ${roomCode}`;
    elements.onlineStatus.textContent = "Aguardando outro jogador entrar.";
  });
  state.socket.on("joined-room", ({ roomCode, playerNumber }) => {
    state.roomCode = roomCode;
    state.playerNumber = playerNumber;
    elements.onlineStatus.textContent = `Conectado na sala ${roomCode}. Escolha sua carta.`;
    startMode("online");
  });
  state.socket.on("opponent-joined", () => {
    elements.onlineStatus.textContent = "Oponente conectado. Escolha sua carta.";
    startMode("online");
  });
  state.socket.on("room-error", (message) => {
    elements.onlineStatus.textContent = message;
  });
  state.socket.on("battle-state", applyOnlineBattleState);
  state.socket.on("opponent-left", () => endBattle("Vitoria", "O oponente saiu da sala."));
}

function createRoom() {
  setupSocket();
  state.socket?.emit("create-room");
}

function joinRoom() {
  setupSocket();
  state.socket?.emit("join-room", elements.roomCode.value.trim().toUpperCase());
}

function renderCardSelection() {
  elements.cardList.innerHTML = "";
  state.cards.forEach((card) => {
    const cardElement = createCardElement(card, { selectable: true, currentHp: card.hp, maxHp: card.hp, energy: 0, statuses: {} });
    cardElement.addEventListener("click", () => chooseCard(card.id));
    elements.cardList.appendChild(cardElement);
  });
}

function chooseCard(cardId) {
  state.selectedCardId = cardId;
  playUiSound("click");

  if (state.mode === "online") {
    state.socket?.emit("select-card", { roomCode: state.roomCode, cardId });
    elements.battleLog.textContent = "Carta escolhida. Aguardando oponente.";
    showWaitingBattle(cardId);
    return;
  }

  startCpuBattle(cardId);
}

function startCpuBattle(cardId) {
  state.player = createFighter(findCard(cardId), "player");
  state.enemy = createFighter(drawCpuCard(cardId), "enemy");
  state.currentTurn = state.player.card.velocidade >= state.enemy.card.velocidade ? "player" : "enemy";
  state.battleOver = false;
  const turnEvents = beginTurn(state.currentTurn);

  renderBattle(buildTurnIntro(turnEvents));
  showScreen("battle");

  if (state.currentTurn === "enemy") {
    setActionsEnabled(false);
    setTimeout(cpuTurn, 1000);
  }
}

function showWaitingBattle(cardId) {
  state.player = createFighter(findCard(cardId), "player");
  state.enemy = null;
  setBattleBackdrop(state.player.card);
  elements.playerFighter.innerHTML = "";
  elements.playerFighter.appendChild(createCardElement(state.player.card, getCardViewOptions(state.player)));
  elements.enemyFighter.innerHTML = "<div class=\"waiting-card\">Aguardando oponente</div>";
  elements.battleMode.textContent = `Online ${state.roomCode}`;
  elements.turnMessage.textContent = "Aguardando";
  elements.restartCpu.style.display = "none";
  setActionsEnabled(false);
  showScreen("battle");
}

function applyOnlineBattleState(serverState) {
  const meKey = `player${state.playerNumber}`;
  const enemyKey = state.playerNumber === 1 ? "player2" : "player1";
  const me = serverState.players[meKey];
  const enemy = serverState.players[enemyKey];
  if (!me?.cardId) return;

  state.player = createFighterFromServer(findCard(me.cardId), "player", me);
  state.enemy = enemy?.cardId ? createFighterFromServer(findCard(enemy.cardId), "enemy", enemy) : null;
  state.currentTurn = serverState.turn === meKey ? "player" : "enemy";
  state.battleOver = Boolean(serverState.winner);

  renderBattle(serverState.log || "Combate online sincronizado.");
  showScreen("battle");

  if (serverState.lastAction) {
    animateAction(serverState.lastAction.actor === meKey ? "player" : "enemy", serverState.lastAction);
  }

  if (serverState.winner) {
    const won = serverState.winner === meKey;
    endBattle(won ? "Vitoria" : "Derrota", won ? "Voce venceu o duelo online." : "Seu oponente venceu o duelo online.");
  }
}

function renderBattle(logMessage = "") {
  setBattleBackdrop(state.player.card);
  elements.playerFighter.innerHTML = "";
  elements.enemyFighter.innerHTML = "";
  elements.playerFighter.appendChild(createCardElement(state.player.card, getCardViewOptions(state.player)));
  elements.enemyFighter.innerHTML = state.enemy
    ? ""
    : "<div class=\"waiting-card\">Aguardando oponente</div>";
  if (state.enemy) elements.enemyFighter.appendChild(createCardElement(state.enemy.card, getCardViewOptions(state.enemy)));

  document.body.classList.toggle("player-turn", state.currentTurn === "player" && !state.battleOver);
  elements.battleMode.textContent = state.mode === "cpu" ? "Modo CPU" : `Online ${state.roomCode}`;
  elements.enemyLabel.textContent = state.mode === "cpu" ? "CPU" : "Oponente";
  elements.restartCpu.style.display = state.mode === "cpu" ? "inline-block" : "none";
  elements.turnMessage.textContent = state.currentTurn === "player" ? "Seu turno" : "Turno do oponente";
  elements.battleLog.textContent = logMessage || getTurnLog();
  setActionsEnabled(state.currentTurn === "player" && !state.battleOver && Boolean(state.enemy));
}

function createCardElement(card, options = {}) {
  const currentHp = Math.max(0, options.currentHp ?? card.hp);
  const maxHp = options.maxHp ?? card.hp;
  const energy = Math.max(0, Math.min(ENERGY_MAX, options.energy ?? 0));
  const statuses = options.statuses || {};
  const article = document.createElement("article");
  article.className = "card";
  article.style.setProperty("--rarity-color", rarityColors[card.raridade] || "var(--rare-comum)");
  article.style.setProperty("--hp-percent", `${Math.round((currentHp / maxHp) * 100)}%`);
  article.style.setProperty("--energy-percent", `${Math.round((energy / ENERGY_MAX) * 100)}%`);

  if (options.selectable) article.classList.add("selectable");
  if (options.energyFull) article.classList.add("energy-full");
  if (options.defending) article.classList.add("defending");
  if (options.ultimateReady) article.classList.add("ultimate-ready");
  if (hasStatus(statuses, "shield")) article.classList.add("shielded");
  if (hasStatus(statuses, "burn")) article.classList.add("burning");
  if (hasStatus(statuses, "bleed")) article.classList.add("bleeding");

  article.innerHTML = `
    <img src="${card.imagem}" alt="${card.nome}">
    <div class="card-overlay">
      <div class="card-top">
        <div class="card-name-row">
          <h3>${card.nome}</h3>
          <span class="rarity">${card.raridade}</span>
        </div>
        <span class="faction">${card.faccao} - ${FACTION_BONUS[card.faccao] || "Estilo hibrido."}</span>
      </div>
      <div class="card-bottom">
        <div class="bar-block hp-block">
          <div class="resource-line"><span>HP</span><strong>${currentHp}/${maxHp}</strong></div>
          <div class="resource-track hp-track"><div class="resource-fill hp-fill"></div></div>
        </div>
        <div class="bar-block energy-block">
          <div class="resource-line"><span>Energia</span><strong>${energy}/${ENERGY_MAX}</strong></div>
          <div class="resource-track energy-track"><div class="resource-fill energy-fill"></div></div>
        </div>
        <div class="status-row">
          ${options.defending ? "<span class=\"status-defense\">Defesa ativa</span>" : ""}
          ${options.ultimateReady ? "<span class=\"status-ultimate\">Ultimate pronto</span>" : ""}
          ${renderStatusBadges(statuses)}
        </div>
        <div class="passive-box">
          <strong>${card.habilidade || PASSIVES[card.id]?.name || "Passiva"}</strong>
          <span>${card.descricao || PASSIVES[card.id]?.hint || "Sem efeito passivo."}</span>
        </div>
        <div class="stats">
          ${createStat("ATQ", card.ataque)}
          ${createStat("DEF", card.defesa)}
          ${createStat("VEL", card.velocidade)}
        </div>
        <p class="special">Especial: ${card.especial}</p>
      </div>
    </div>
  `;

  return article;
}

function renderStatusBadges(statuses) {
  return Object.entries(statuses)
    .filter(([, status]) => status && (status.turns > 0 || status.amount > 0))
    .map(([key, status]) => {
      const meta = STATUS_META[key] || { label: key, className: "" };
      const value = status.amount ? ` ${status.amount}` : status.turns ? ` ${status.turns}t` : "";
      return `<span class="${meta.className}">${meta.label}${value}</span>`;
    })
    .join("");
}

function createStat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function playerAction(type) {
  if (!canUseAction(state.player, type)) {
    renderBattle(getActionBlockedMessage(type));
    return;
  }

  if (state.mode === "online") {
    state.socket?.emit("player-action", { roomCode: state.roomCode, type });
    setActionsEnabled(false);
    return;
  }

  if (state.currentTurn !== "player" || state.battleOver) return;
  resolveCpuAction(state.player, state.enemy, type);
}

function resolveCpuAction(actor, defender, type) {
  const action = resolveAction(actor, defender, type);
  renderBattle(action.message);
  animateAction(actor.side, action);

  if (checkCpuEnd()) return;

  state.currentTurn = actor.side === "player" ? "enemy" : "player";
  const turnEvents = beginTurn(state.currentTurn);

  if (checkCpuEnd()) return;

  if (state.currentTurn === "enemy") {
    setActionsEnabled(false);
    setTimeout(cpuTurn, action.type === "ultimate" ? 1450 : 950);
  } else {
    setTimeout(() => renderBattle(buildTurnIntro(turnEvents)), 650);
  }
}

function cpuTurn() {
  if (!state.battleOver) resolveCpuAction(state.enemy, state.player, chooseCpuAction());
}

function chooseCpuAction() {
  if (canUseAction(state.enemy, "ultimate") && (state.player.hp <= state.player.maxHp * 0.72 || Math.random() > 0.35)) return "ultimate";
  if (canUseAction(state.enemy, "special") && Math.random() > 0.25) return "special";
  if (state.enemy.hp < state.enemy.maxHp * 0.48 && Math.random() > 0.42) return "defend";
  return "basic";
}

function resolveAction(actor, defender, type) {
  if (type === "defend") return resolveDefend(actor);

  const evaded = tryEvade(defender);
  if (evaded) {
    clearOneTurnBuffs(actor);
    playUiSound("evade");
    return { type, damage: 0, evaded: true, critical: false, defended: false, message: `${defender.card.nome} DESVIOU em uma falha neon.` };
  }

  spendEnergy(actor, type);
  const critical = Math.random() < getCriticalChance(actor, type);
  let damage = calculateDamage(actor, defender, type, critical);
  const shielded = absorbShield(defender, damage);
  damage = shielded.remainingDamage;
  const defended = defender.defending;

  if (defended) {
    damage = Math.ceil(damage * 0.5);
    defender.defending = false;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  applyPostAttackPassives(actor, defender, type, damage);
  applyCounterPassives(actor, defender, damage);
  clearOneTurnBuffs(actor);
  playActionSound(type, critical);

  return {
    type,
    damage,
    critical,
    defended,
    evaded: false,
    blocked: shielded.blocked,
    statusText: buildFloatingText({ critical, defended, blocked: shielded.blocked }),
    message: buildDamageMessage(actor, type, damage, critical, defended, shielded.blocked)
  };
}

function resolveDefend(actor) {
  actor.defending = true;
  addStatus(actor, "defenseBuff", { turns: 1, power: 0.2 });
  if (actor.card.id === "rx-sentinel") addShield(actor, BALANCE.shields.sentinelDefend, 2);
  if (actor.card.faccao === "TecnoCore") addShield(actor, BALANCE.shields.tecnoCoreDefend, 1);
  playUiSound("defend");
  return {
    type: "defend",
    damage: 0,
    critical: false,
    defended: false,
    message: `${actor.card.nome} levantou defesa. Campo tatico armado.`
  };
}

function beginTurn(side) {
  const fighter = side === "player" ? state.player : state.enemy;
  if (!fighter || state.battleOver) return [];

  fighter.turns += 1;
  const events = applyTurnStatuses(fighter);
  if (fighter.card.id === "ember-queen" && fighter.hp <= fighter.maxHp * 0.45) {
    addStatus(fighter, "attackBuff", { turns: 1, power: 0.18 });
    events.push(`${fighter.card.nome} entrou em furia: ataque aumentado.`);
  }
  const extraEnergy = fighter.card.id === "zero-mask" ? 15 : 0;
  fighter.energy = Math.min(ENERGY_MAX, fighter.energy + ENERGY_PER_TURN + extraEnergy);
  if (fighter.energy >= ENERGY_MAX) playUiSound("energy");
  if (hasStatus(fighter.statuses, "stun")) {
    fighter.statuses.stun.turns -= 1;
    events.push(`${fighter.card.nome} ficou em STUN e perdeu o turno.`);
    state.currentTurn = side === "player" ? "enemy" : "player";
  }
  return events;
}

function applyTurnStatuses(fighter) {
  const events = [];
  const burn = fighter.statuses.burn;
  const bleed = fighter.statuses.bleed;
  const drain = fighter.statuses.drained;

  if (burn?.turns > 0) {
    fighter.hp = Math.max(0, fighter.hp - burn.power);
    burn.turns -= 1;
    events.push(`${fighter.card.nome} sofreu ${burn.power} de queimadura.`);
  }

  if (bleed?.turns > 0) {
    fighter.hp = Math.max(0, fighter.hp - bleed.power);
    bleed.turns -= 1;
    events.push(`${fighter.card.nome} perdeu ${bleed.power} por sangramento.`);
  }

  if (drain?.turns > 0) {
    fighter.energy = Math.max(0, fighter.energy - drain.power);
    drain.turns -= 1;
    events.push(`${fighter.card.nome} perdeu ${drain.power} de energia.`);
  }

  tickStatus(fighter, "shield");
  tickStatus(fighter, "attackBuff");
  tickStatus(fighter, "defenseBuff");
  tickStatus(fighter, "marked");
  tickStatus(fighter, "evasion");
  return events;
}

function calculateDamage(actor, defender, type, critical) {
  const actionBalance = BALANCE.actions[type] || BALANCE.actions.basic;
  const attackFactor = clamp(
    1 + ((actor.card.ataque - BALANCE.power.attackReference) * BALANCE.power.attackStep),
    BALANCE.power.minAttackFactor,
    BALANCE.power.maxAttackFactor
  );
  const defenseFactor = clamp(
    1 - ((defender.card.defesa - BALANCE.power.defenseReference) * BALANCE.power.defenseStep),
    BALANCE.power.minDefenseFactor,
    BALANCE.power.maxDefenseFactor
  );

  let modifier = attackFactor * defenseFactor;
  if (hasStatus(actor.statuses, "attackBuff")) modifier *= 1 + actor.statuses.attackBuff.power;
  if (hasStatus(defender.statuses, "defenseBuff")) modifier *= 1 - defender.statuses.defenseBuff.power;
  if (hasStatus(defender.statuses, "marked")) modifier *= BALANCE.passives.markedBonus;
  if (actor.card.id === "ember-queen") modifier *= 1 + ((1 - actor.hp / actor.maxHp) * BALANCE.passives.emberMissingHpBonus);
  if (actor.card.faccao === "Inferna" && type !== "basic") modifier *= BALANCE.passives.infernaSpecialBonus;
  if (defender.card.id === "omega-titan") modifier *= BALANCE.passives.omegaReduction;
  if (defender.card.faccao === "TecnoCore") modifier *= BALANCE.passives.tecnoCoreReduction;

  let damage = Math.round(defender.maxHp * actionBalance.hpRatio * modifier);
  if (critical) damage *= 2;

  const cap = Math.round(defender.maxHp * actionBalance.maxHpRatio);
  return clamp(damage, BALANCE.power.minimumDamage, Math.max(BALANCE.power.minimumDamage, cap));
}

function applyPostAttackPassives(actor, defender, type, damage) {
  if (damage <= 0) return;
  if (actor.card.id === "crimson") addStatus(defender, "bleed", { turns: 3, power: BALANCE.dots.bleed });
  if (actor.card.id === "raven-exe") stealEnergy(actor, defender, 18);
  if (actor.card.id === "nexus-9" && type === "special") addShield(actor, BALANCE.shields.nexusSpecial, 2);
  if (actor.card.id === "solaris" && type !== "basic") addStatus(defender, "burn", { turns: 3, power: BALANCE.dots.intenseBurn });
  if (actor.card.id === "omega-titan" && type === "ultimate") addStatus(defender, "stun", { turns: 1, power: 1 });
  if (actor.card.id === "vulkar" && type === "ultimate") addStatus(defender, "stun", { turns: 1, power: 1 });
  if (actor.card.id === "byte-hunter" && type === "basic" && Math.random() < 0.35) addStatus(defender, "marked", { turns: 1, power: 0.22 });
  if (actor.card.id === "zero-mask" && type === "special") addStatus(actor, "evasion", { turns: 1, power: 0.2 });
  if (actor.card.faccao === "Inferna" && type === "ultimate") addStatus(defender, "burn", { turns: 2, power: BALANCE.dots.ultimateBurn });
  if (actor.card.faccao === "ShadowByte" && type === "special") stealEnergy(actor, defender, 8);
}

function applyCounterPassives(actor, defender, damage) {
  if (damage <= 0) return;
  if (defender.card.id === "vulkar" && Math.random() < 0.35) addStatus(actor, "burn", { turns: 2, power: BALANCE.dots.counterBurn });
}

function tryEvade(defender) {
  let chance = 0;
  if (defender.card.id === "ghost-link") chance += 0.15;
  if (defender.card.faccao === "ShadowByte") chance += 0.04;
  if (hasStatus(defender.statuses, "evasion")) chance += defender.statuses.evasion.power;
  return Math.random() < chance;
}

function getCriticalChance(actor, type) {
  let chance = BASE_CRITICAL_CHANCE;
  if (actor.card.id === "cyber-shade") chance += 0.2;
  if (actor.card.faccao === "ShadowByte") chance += 0.06;
  if (type === "ultimate") chance += 0.12;
  return chance;
}

function getActionMultiplier(type) {
  if (type === "ultimate") return 3.1;
  if (type === "special") return 1.75;
  return 1;
}

function spendEnergy(actor, type) {
  if (type === "special") actor.energy = Math.max(0, actor.energy - SPECIAL_COST);
  if (type === "ultimate") {
    actor.energy = Math.max(0, actor.energy - ULTIMATE_COST);
    actor.ultimateUsed = true;
  }
}

function addStatus(fighter, key, value) {
  fighter.statuses[key] = { ...(fighter.statuses[key] || {}), ...value };
}

function addShield(fighter, amount, turns) {
  fighter.statuses.shield = {
    amount: (fighter.statuses.shield?.amount || 0) + amount,
    turns
  };
}

function absorbShield(defender, damage) {
  const shield = defender.statuses.shield;
  if (!shield?.amount) return { blocked: 0, remainingDamage: damage };
  const blocked = Math.min(shield.amount, damage);
  shield.amount -= blocked;
  return { blocked, remainingDamage: damage - blocked };
}

function stealEnergy(actor, defender, amount) {
  const stolen = Math.min(amount, defender.energy);
  defender.energy -= stolen;
  actor.energy = Math.min(ENERGY_MAX, actor.energy + stolen);
  addStatus(defender, "drained", { turns: 1, power: 5 });
}

function tickStatus(fighter, key) {
  const status = fighter.statuses[key];
  if (!status) return;
  if (status.turns > 0) status.turns -= 1;
  if (status.turns <= 0 || status.amount <= 0) delete fighter.statuses[key];
}

function clearOneTurnBuffs(fighter) {
  if (fighter.statuses.attackBuff?.turns <= 0) delete fighter.statuses.attackBuff;
}

function hasStatus(statuses, key) {
  const status = statuses?.[key];
  return Boolean(status && ((status.turns ?? 0) > 0 || (status.amount ?? 0) > 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function checkCpuEnd() {
  if (state.player.hp <= 0) {
    state.battleOver = true;
    endBattle("Derrota", `${state.enemy.card.nome} dominou a arena.`);
    return true;
  }
  if (state.enemy.hp <= 0) {
    state.battleOver = true;
    endBattle("Vitoria", `${state.player.card.nome} venceu com autoridade.`);
    return true;
  }
  return false;
}

function animateAction(actor, action) {
  const attackerSlot = actor === "player" ? elements.playerFighter : elements.enemyFighter;
  const defenderSlot = actor === "player" ? elements.enemyFighter : elements.playerFighter;
  const attackerCard = attackerSlot.querySelector(".card");
  const defenderCard = defenderSlot.querySelector(".card");

  createParticles(action.type);
  if (action.type === "defend") {
    attackerCard?.classList.add("defend-pulse");
    setTimeout(() => attackerCard?.classList.remove("defend-pulse"), 700);
    return;
  }
  if (action.evaded) {
    defenderCard?.classList.add("evade-pulse");
    showFloatingText("DESVIOU", "evade-text");
    setTimeout(() => defenderCard?.classList.remove("evade-pulse"), 700);
    return;
  }

  attackerCard?.classList.add(getAttackClass(action.type));
  defenderCard?.classList.add("hit");
  document.body.classList.add(action.type === "ultimate" ? "ultimate-flash" : "screen-shake");
  showDamage(action.damage, action.critical, action.defended, action.blocked);
  setTimeout(() => {
    attackerCard?.classList.remove("attack-basic", "attack-special", "attack-ultimate");
    defenderCard?.classList.remove("hit");
    document.body.classList.remove("screen-shake", "ultimate-flash");
  }, action.type === "ultimate" ? 980 : 560);
}

function getAttackClass(type) {
  if (type === "ultimate") return "attack-ultimate";
  return type === "special" ? "attack-special" : "attack-basic";
}

function createParticles(type) {
  const count = type === "ultimate" ? 24 : type === "special" ? 14 : 8;
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("i");
    particle.className = `particle particle-${type}`;
    particle.style.left = `${20 + Math.random() * 60}%`;
    particle.style.top = `${30 + Math.random() * 35}%`;
    particle.style.setProperty("--x", `${-80 + Math.random() * 160}px`);
    particle.style.setProperty("--y", `${-90 + Math.random() * 40}px`);
    elements.damageLayer.appendChild(particle);
    setTimeout(() => particle.remove(), 760);
  }
}

function showDamage(damage, critical, defended, blocked = 0) {
  const extra = [
    critical ? "<b>CRÍTICO!</b>" : "",
    defended ? "<small>BLOQUEADO</small>" : "",
    blocked ? `<small>ESCUDO -${blocked}</small>` : ""
  ].join("");
  showFloatingText(`${extra}<strong>-${damage}</strong>`, critical ? "critical" : defended || blocked ? "defended-damage" : "");
}

function showFloatingText(content, className = "") {
  const number = document.createElement("span");
  number.className = `damage-number ${className}`;
  number.innerHTML = content;
  elements.damageLayer.appendChild(number);
  setTimeout(() => number.remove(), 1150);
}

function setActionsEnabled(enabled) {
  const canAct = enabled && state.currentTurn === "player" && state.player && state.enemy;
  elements.basicAttack.disabled = !canAct;
  elements.defendAction.disabled = !canAct;
  elements.specialAttack.disabled = !canAct || !canUseAction(state.player, "special");
  elements.ultimateAttack.disabled = !canAct || !canUseAction(state.player, "ultimate");
}

function canUseAction(fighter, type) {
  if (!fighter) return false;
  if (type === "special") return fighter.energy >= SPECIAL_COST;
  if (type === "ultimate") return fighter.energy >= ULTIMATE_COST && fighter.turns >= ULTIMATE_TURNS && !fighter.ultimateUsed;
  return true;
}

function getActionBlockedMessage(type) {
  if (type === "special") return "Energia insuficiente. Carregue ate 100 para usar o especial.";
  if (type === "ultimate") return `Ultimate exige energia cheia e turno ${ULTIMATE_TURNS}.`;
  return "Acao indisponivel agora.";
}

function buildDamageMessage(actor, type, damage, critical, defended, blocked) {
  const moveName = getMoveName(actor.card, type);
  const tags = [
    critical ? "CRÍTICO!" : "",
    defended ? "BLOQUEADO!" : "",
    blocked ? `ESCUDO absorveu ${blocked}.` : ""
  ].filter(Boolean).join(" ");
  return `${actor.card.nome} acionou ${moveName} e causou ${damage} de dano. ${tags}`.trim();
}

function buildTurnIntro(events) {
  const base = state.currentTurn === "player"
    ? "Seu turno. Energia carregada, escolha sua jogada."
    : "A CPU assume o turno. Observe os status ativos.";
  return events?.length ? `${events.join(" ")} ${base}` : base;
}

function buildFloatingText({ critical, defended, blocked }) {
  return [critical ? "CRÍTICO!" : "", defended ? "BLOQUEADO!" : "", blocked ? "ESCUDO!" : ""].filter(Boolean).join(" ");
}

function getMoveName(card, type) {
  if (type === "ultimate") return "PROTOCOLO OMEGA";
  if (type === "special") return card.especial;
  return "ataque basico";
}

function endBattle(title, text) {
  setActionsEnabled(false);
  document.body.classList.remove("player-turn");
  elements.resultTitle.textContent = title;
  elements.resultText.textContent = text;
  elements.resultModal.classList.add("active");
  elements.resultModal.setAttribute("aria-hidden", "false");
  playUiSound(title === "Vitoria" ? "victory" : "defeat");
}

function startResultRematch() {
  elements.resultModal.classList.remove("active");
  elements.resultModal.setAttribute("aria-hidden", "true");

  if (state.mode === "cpu") {
    startMode("cpu");
    return;
  }

  returnToMenu();
}

function closeResult() {
  elements.resultModal.classList.remove("active");
  elements.resultModal.setAttribute("aria-hidden", "true");
  returnToMenu();
}

function returnToMenu() {
  if (state.socket && state.roomCode) state.socket.emit("leave-room", state.roomCode);
  state.roomCode = "";
  state.selectedCardId = "";
  state.player = null;
  state.enemy = null;
  state.battleOver = false;
  document.body.classList.remove("player-turn", "screen-shake", "ultimate-flash");
  clearBattleBackdrop();
  elements.createdRoom.textContent = "Nenhuma sala criada.";
  elements.onlineStatus.textContent = "Conecte dois jogadores para iniciar.";
  elements.roomCode.value = "";
  elements.resultModal.classList.remove("active");
  showScreen("menu");
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  elements.soundToggle.textContent = state.soundEnabled ? "Som ligado" : "Som desligado";
  elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
}

function playActionSound(type, critical) {
  if (type === "ultimate") {
    playSoundFile("ultimate", () => playCombo([[80, 0.16, "sawtooth"], [360, 0.18, "square"], [820, 0.24, "triangle"]]));
    return;
  }
  if (critical) {
    playCombo([[760, 0.14, "square"], [220, 0.14, "sawtooth"]]);
    return;
  }
  if (type === "special") {
    playSoundFile("special", () => playTone(190, 0.22, "sawtooth"));
    return;
  }
  playSoundFile("attack", () => playTone(280, 0.12, "square"));
}

function playUiSound(kind) {
  const sounds = {
    click: [[520, 0.06, "square"]],
    defend: [[420, 0.14, "triangle"]],
    evade: [[900, 0.1, "sine"]],
    energy: [[620, 0.08, "triangle"], [920, 0.08, "triangle"]],
    victory: [[520, 0.14, "triangle"], [760, 0.2, "triangle"]],
    defeat: [[180, 0.22, "sawtooth"]]
  };
  playSoundFile(kind, () => playCombo(sounds[kind] || sounds.click));
}

function playSoundFile(kind, fallback) {
  if (!state.soundEnabled || !SOUND_FILES[kind]) return false;

  try {
    if (!audioCache[kind]) {
      audioCache[kind] = new Audio(SOUND_FILES[kind]);
      audioCache[kind].preload = "auto";
    }

    const audio = audioCache[kind].cloneNode();
    audio.volume = kind === "ultimate" ? 0.65 : 0.45;
    audio.play().catch(() => fallback?.());
    return true;
  } catch {
    fallback?.();
    return false;
  }
}

function playCombo(notes) {
  notes.forEach(([frequency, duration, type], index) => {
    setTimeout(() => playTone(frequency, duration, type), index * 90);
  });
}

function playTone(frequency, duration, type = "sine") {
  if (!state.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.045, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function drawCpuCard(playerCardId) {
  const availableCards = state.cards.filter((card) => card.id !== playerCardId);
  return availableCards[Math.floor(Math.random() * availableCards.length)];
}

function createFighter(card, side) {
  return {
    side,
    card,
    hp: card.hp,
    maxHp: card.hp,
    energy: 0,
    turns: 0,
    defending: false,
    ultimateUsed: false,
    statuses: {}
  };
}

function createFighterFromServer(card, side, serverFighter) {
  return {
    side,
    card,
    hp: serverFighter.hp,
    maxHp: card.hp,
    energy: serverFighter.energy ?? 0,
    turns: serverFighter.turns ?? 0,
    defending: Boolean(serverFighter.defending),
    ultimateUsed: Boolean(serverFighter.ultimateUsed),
    statuses: serverFighter.statuses || {}
  };
}

function getCardViewOptions(fighter) {
  return {
    currentHp: fighter.hp,
    maxHp: fighter.maxHp,
    energy: fighter.energy,
    statuses: fighter.statuses,
    defending: fighter.defending,
    energyFull: fighter.energy >= ENERGY_MAX,
    ultimateReady: fighter.energy >= ULTIMATE_COST && fighter.turns >= ULTIMATE_TURNS && !fighter.ultimateUsed
  };
}

function setBattleBackdrop(card) {
  clearBattleBackdrop();
  document.body.classList.add("battle-active", getFactionBackdropClass(card.faccao));
}

function clearBattleBackdrop() {
  document.body.classList.remove("battle-active", "battle-tecnocore", "battle-inferna", "battle-shadowbyte");
}

function getFactionBackdropClass(faction) {
  if (faction === "TecnoCore") return "battle-tecnocore";
  if (faction === "Inferna") return "battle-inferna";
  if (faction === "ShadowByte") return "battle-shadowbyte";
  return "battle-shadowbyte";
}

function findCard(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function getTurnLog() {
  if (!state.enemy) return "Aguardando oponente.";
  return state.currentTurn === "player"
    ? "Seu turno: avalie energia, status, passiva e risco antes de agir."
    : "O oponente prepara uma jogada.";
}

init().catch((error) => {
  elements.cardList.innerHTML = `<p class="status-text">${error.message}</p>`;
});
