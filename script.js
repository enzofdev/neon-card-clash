const ENERGY_MAX = 100;
const ENERGY_PER_TURN = 20;
const SPECIAL_COST = 100;
const ULTIMATE_TURNS = 4;
const CRITICAL_CHANCE = 0.15;

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
  soundEnabled: true,
  lastAction: null
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
  resultButton: document.querySelector("#result-button"),
  soundToggle: document.querySelector("#sound-toggle"),
  createdRoom: document.querySelector("#created-room"),
  onlineStatus: document.querySelector("#online-status"),
  roomCode: document.querySelector("#room-code")
};

const rarityColors = {
  "Comum": "var(--rare-comum)",
  "Raro": "var(--rare-raro)",
  "Épico": "var(--rare-epico)",
  "Lendário": "var(--rare-lendario)"
};

async function init() {
  state.cards = await loadCards();
  bindEvents();
  renderCardSelection();
}

async function loadCards() {
  const response = await fetch("cards.json");

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar cards.json.");
  }

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
  elements.resultButton.addEventListener("click", closeResult);
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
  state.lastAction = null;

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
    if (typeof io === "undefined") {
      elements.onlineStatus.textContent = "Socket.IO indisponivel. Rode o projeto com npm start.";
    }
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
  const roomCode = elements.roomCode.value.trim().toUpperCase();
  state.socket?.emit("join-room", roomCode);
}

function renderCardSelection() {
  elements.cardList.innerHTML = "";

  state.cards.forEach((card) => {
    const cardElement = createCardElement(card, {
      selectable: true,
      currentHp: card.hp,
      maxHp: card.hp,
      energy: 0
    });

    cardElement.addEventListener("click", () => chooseCard(card.id));
    elements.cardList.appendChild(cardElement);
  });
}

function chooseCard(cardId) {
  state.selectedCardId = cardId;
  playTone(500, 0.08, "square");

  if (state.mode === "online") {
    state.socket?.emit("select-card", {
      roomCode: state.roomCode,
      cardId
    });
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
  beginTurn(state.currentTurn);

  renderBattle(getTurnIntro());
  showScreen("battle");

  if (state.currentTurn === "enemy") {
    setActionsEnabled(false);
    setTimeout(cpuTurn, 900);
  }
}

function showWaitingBattle(cardId) {
  state.player = createFighter(findCard(cardId), "player");
  state.enemy = null;
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

  if (!me?.cardId) {
    return;
  }

  state.player = createFighterFromServer(findCard(me.cardId), "player", me);
  state.enemy = enemy?.cardId ? createFighterFromServer(findCard(enemy.cardId), "enemy", enemy) : null;
  state.currentTurn = serverState.turn === meKey ? "player" : "enemy";
  state.battleOver = Boolean(serverState.winner);

  renderBattle(serverState.log || "Combate online sincronizado.");
  showScreen("battle");

  if (serverState.lastAction) {
    const actor = serverState.lastAction.actor === meKey ? "player" : "enemy";
    animateAction(actor, serverState.lastAction);
  }

  if (serverState.winner) {
    const won = serverState.winner === meKey;
    endBattle(won ? "Vitoria" : "Derrota", won ? "Voce venceu o duelo online." : "Seu oponente venceu o duelo online.");
  }
}

function renderBattle(logMessage = "") {
  elements.playerFighter.innerHTML = "";
  elements.enemyFighter.innerHTML = "";

  elements.playerFighter.appendChild(createCardElement(state.player.card, getCardViewOptions(state.player)));

  if (state.enemy) {
    elements.enemyFighter.appendChild(createCardElement(state.enemy.card, getCardViewOptions(state.enemy)));
  } else {
    elements.enemyFighter.innerHTML = "<div class=\"waiting-card\">Aguardando oponente</div>";
  }

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
  const hpPercent = Math.round((currentHp / maxHp) * 100);
  const energyPercent = Math.round((energy / ENERGY_MAX) * 100);
  const article = document.createElement("article");
  article.className = "card";
  article.style.setProperty("--rarity-color", rarityColors[card.raridade] || "var(--rare-comum)");
  article.style.setProperty("--hp-percent", `${hpPercent}%`);
  article.style.setProperty("--energy-percent", `${energyPercent}%`);

  if (options.selectable) {
    article.classList.add("selectable");
  }

  if (options.energyFull) {
    article.classList.add("energy-full");
  }

  if (options.defending) {
    article.classList.add("defending");
  }

  if (options.ultimateReady) {
    article.classList.add("ultimate-ready");
  }

  article.innerHTML = `
    <img src="${card.imagem}" alt="${card.nome}">
    <div class="card-overlay">
      <div class="card-top">
        <div class="card-name-row">
          <h3>${card.nome}</h3>
          <span class="rarity">${card.raridade}</span>
        </div>
        <span class="faction">${card.faccao}</span>
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
          ${options.defending ? "<span>Defesa ativa</span>" : ""}
          ${options.ultimateReady ? "<span>Ultimate pronto</span>" : ""}
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

function createStat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function playerAction(type) {
  if (!canUseAction(state.player, type)) {
    renderBattle(getActionBlockedMessage(type));
    return;
  }

  if (state.mode === "online") {
    state.socket?.emit("player-action", {
      roomCode: state.roomCode,
      type
    });
    setActionsEnabled(false);
    return;
  }

  if (state.currentTurn !== "player" || state.battleOver) {
    return;
  }

  resolveCpuAction(state.player, state.enemy, type);
}

function resolveCpuAction(actor, defender, type) {
  state.lastAction = resolveAction(actor, defender, type);
  const actionLog = buildActionLog(actor, state.lastAction);
  renderBattle(actionLog);
  animateAction(actor.side, state.lastAction);

  if (checkCpuEnd()) {
    return;
  }

  state.currentTurn = actor.side === "player" ? "enemy" : "player";
  beginTurn(state.currentTurn);

  if (state.currentTurn === "enemy") {
    setActionsEnabled(false);
    setTimeout(cpuTurn, 1050);
  } else {
    setTimeout(() => renderBattle(getTurnIntro()), 650);
  }
}

function cpuTurn() {
  if (state.battleOver) {
    return;
  }

  resolveCpuAction(state.enemy, state.player, chooseCpuAction());
}

function chooseCpuAction() {
  if (canUseAction(state.enemy, "ultimate") && state.player.hp <= state.player.maxHp * 0.68) {
    return "ultimate";
  }

  if (canUseAction(state.enemy, "special") && Math.random() > 0.32) {
    return "special";
  }

  if (state.enemy.hp < state.enemy.maxHp * 0.42 && Math.random() > 0.48) {
    return "defend";
  }

  return "basic";
}

function resolveAction(actor, defender, type) {
  if (type === "defend") {
    actor.defending = true;
    playTone(420, 0.14, "triangle");
    return {
      type,
      damage: 0,
      critical: false,
      defended: false,
      message: `${actor.card.nome} ergueu uma barreira defensiva.`
    };
  }

  if (type === "special") {
    actor.energy = Math.max(0, actor.energy - SPECIAL_COST);
  }

  if (type === "ultimate") {
    actor.ultimateUsed = true;
  }

  const critical = Math.random() < CRITICAL_CHANCE;
  const rawDamage = Math.round(actor.card.ataque * getActionMultiplier(type));
  const mitigated = Math.max(6, rawDamage - Math.round(defender.card.defesa * 0.42));
  const variance = Math.floor(Math.random() * 7) - 3;
  let damage = Math.max(4, mitigated + variance);

  if (critical) {
    damage *= 2;
  }

  const defended = defender.defending;
  if (defended) {
    damage = Math.ceil(damage * 0.5);
    defender.defending = false;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  playActionSound(type, critical);

  return {
    type,
    damage,
    critical,
    defended,
    message: buildDamageMessage(actor, type, damage, critical, defended)
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

function beginTurn(side) {
  const fighter = side === "player" ? state.player : state.enemy;

  if (!fighter || state.battleOver) {
    return;
  }

  fighter.turns += 1;
  fighter.energy = Math.min(ENERGY_MAX, fighter.energy + ENERGY_PER_TURN);
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

  if (action.type === "defend") {
    attackerCard?.classList.add("defend-pulse");
    setTimeout(() => attackerCard?.classList.remove("defend-pulse"), 700);
    return;
  }

  attackerCard?.classList.add(getAttackClass(action.type));
  defenderCard?.classList.add("hit");
  document.body.classList.add(action.type === "ultimate" ? "ultimate-flash" : "screen-shake");
  showDamage(action.damage, action.critical, action.defended);

  setTimeout(() => {
    attackerCard?.classList.remove("attack-basic", "attack-special", "attack-ultimate");
    defenderCard?.classList.remove("hit");
    document.body.classList.remove("screen-shake", "ultimate-flash");
  }, action.type === "ultimate" ? 820 : 520);
}

function getAttackClass(type) {
  if (type === "ultimate") {
    return "attack-ultimate";
  }

  return type === "special" ? "attack-special" : "attack-basic";
}

function showDamage(damage, critical, defended) {
  const number = document.createElement("span");
  number.className = `damage-number${critical ? " critical" : ""}${defended ? " defended-damage" : ""}`;
  number.innerHTML = `${critical ? "<b>CRÍTICO!</b>" : ""}<strong>-${damage}</strong>${defended ? "<small>bloqueado</small>" : ""}`;
  elements.damageLayer.appendChild(number);
  setTimeout(() => number.remove(), 1100);
}

function setActionsEnabled(enabled) {
  const canAct = enabled && state.currentTurn === "player" && state.player && state.enemy;
  elements.basicAttack.disabled = !canAct;
  elements.defendAction.disabled = !canAct;
  elements.specialAttack.disabled = !canAct || !canUseAction(state.player, "special");
  elements.ultimateAttack.disabled = !canAct || !canUseAction(state.player, "ultimate");
}

function canUseAction(fighter, type) {
  if (!fighter) {
    return false;
  }

  if (type === "special") {
    return fighter.energy >= SPECIAL_COST;
  }

  if (type === "ultimate") {
    return fighter.turns >= ULTIMATE_TURNS && !fighter.ultimateUsed;
  }

  return true;
}

function getActionBlockedMessage(type) {
  if (type === "special") {
    return "Energia insuficiente. Carregue ate 100 para usar o especial.";
  }

  if (type === "ultimate") {
    return `Ultimate bloqueado. Sobreviva ate o turno ${ULTIMATE_TURNS}.`;
  }

  return "Acao indisponivel agora.";
}

function buildActionLog(actor, action) {
  if (action.type === "defend") {
    return action.message;
  }

  return `${action.message} ${actor.side === "player" ? "O inimigo cambaleia." : "Sua carta absorve o impacto."}`;
}

function buildDamageMessage(actor, type, damage, critical, defended) {
  const moveName = getMoveName(actor.card, type);
  const criticalText = critical ? " CRÍTICO!" : "";
  const defenseText = defended ? " A defesa reduziu o impacto." : "";
  return `${actor.card.nome} detonou ${moveName} e causou ${damage} de dano.${criticalText}${defenseText}`;
}

function getMoveName(card, type) {
  if (type === "ultimate") {
    return "PROTOCOLO OMEGA";
  }

  if (type === "special") {
    return card.especial;
  }

  return "ataque basico";
}

function endBattle(title, text) {
  setActionsEnabled(false);
  document.body.classList.remove("player-turn");
  elements.resultTitle.textContent = title;
  elements.resultText.textContent = text;
  elements.resultModal.classList.add("active");
  elements.resultModal.setAttribute("aria-hidden", "false");
  playTone(title === "Vitoria" ? 720 : 120, 0.35, "triangle");
}

function closeResult() {
  elements.resultModal.classList.remove("active");
  elements.resultModal.setAttribute("aria-hidden", "true");
  returnToMenu();
}

function returnToMenu() {
  if (state.socket && state.roomCode) {
    state.socket.emit("leave-room", state.roomCode);
  }

  state.roomCode = "";
  state.selectedCardId = "";
  state.player = null;
  state.enemy = null;
  state.battleOver = false;
  state.lastAction = null;
  document.body.classList.remove("player-turn", "screen-shake", "ultimate-flash");
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
    playTone(92, 0.2, "sawtooth");
    setTimeout(() => playTone(520, 0.26, "square"), 90);
    setTimeout(() => playTone(980, 0.22, "triangle"), 180);
    return;
  }

  if (critical) {
    playTone(760, 0.18, "square");
    setTimeout(() => playTone(240, 0.16, "sawtooth"), 80);
    return;
  }

  playTone(type === "special" ? 190 : 280, type === "special" ? 0.22 : 0.12, type === "special" ? "sawtooth" : "square");
}

function playTone(frequency, duration, type = "sine") {
  if (!state.soundEnabled) {
    return;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

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
    ultimateUsed: false
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
    ultimateUsed: Boolean(serverFighter.ultimateUsed)
  };
}

function getCardViewOptions(fighter) {
  return {
    currentHp: fighter.hp,
    maxHp: fighter.maxHp,
    energy: fighter.energy,
    turns: fighter.turns,
    defending: fighter.defending,
    energyFull: fighter.energy >= ENERGY_MAX,
    ultimateReady: fighter.turns >= ULTIMATE_TURNS && !fighter.ultimateUsed
  };
}

function findCard(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function getTurnIntro() {
  return state.currentTurn === "player"
    ? "Seus sistemas carregaram +20 de energia. Escolha o proximo golpe."
    : "A CPU assumiu iniciativa. Prepare-se para o impacto.";
}

function getTurnLog() {
  if (!state.enemy) {
    return "Aguardando oponente.";
  }

  return state.currentTurn === "player"
    ? "Seu turno: ataque, defenda, carregue energia e espere a janela do Ultimate."
    : "O oponente prepara uma ofensiva.";
}

init().catch((error) => {
  elements.cardList.innerHTML = `<p class="status-text">${error.message}</p>`;
});
