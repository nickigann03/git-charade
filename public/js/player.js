const socket = io();

// State
let playerId = localStorage.getItem('charades_player_id');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('charades_player_id', playerId);
}
let playerName = localStorage.getItem('charades_player_name') || '';
let myTeam = null;
let currentWordSeq = 0;
let gameState = null;
let currentWordData = null; // { word, wordSeq, skipsLeft }
let timerInterval = null;

// DOM Elements
const views = {
  join: document.getElementById('view-join'),
  lobby: document.getElementById('view-lobby'),
  ready: document.getElementById('view-ready'),
  playingActor: document.getElementById('view-playing-actor'),
  playingObserver: document.getElementById('view-playing-observer'),
  over: document.getElementById('view-over')
};

const joinInput = document.getElementById('player-name');
const btnJoin = document.getElementById('btn-join');

if (playerName) joinInput.value = playerName;

// Audio / Vibrate / WakeLock
let wakeLock = null;
const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {}
};
const releaseWakeLock = async () => {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
};

const vibrate = (pattern) => {
  if (navigator.vibrate) navigator.vibrate(pattern);
};

// Functions
const showView = (viewName) => {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
};

const updateThemeColor = (team) => {
  const root = document.documentElement;
  const themeColorMeta = document.getElementById('theme-color');
  if (team === 'red') {
    document.body.className = 'team-red-bg';
    themeColorMeta.content = '#E5402F';
  } else if (team === 'blue') {
    document.body.className = 'team-blue-bg';
    themeColorMeta.content = '#2E58D0';
  } else {
    document.body.className = '';
    themeColorMeta.content = '#ffffff';
  }
};

const getMyPlayer = () => {
  if (!gameState || !gameState.players) return null;
  return gameState.players[playerId];
};

const sendAction = (action) => {
  socket.emit('player:action', {
    playerId,
    action,
    wordSeq: currentWordData ? currentWordData.wordSeq : 0
  });
};

// UI Handlers
btnJoin.addEventListener('click', () => {
  const name = joinInput.value.trim();
  if (name) {
    playerName = name;
    localStorage.setItem('charades_player_name', name);
    socket.emit('player:join', { playerId, name });
  }
});

document.getElementById('btn-start-turn').addEventListener('click', () => {
  sendAction('start_turn');
});

const handleCorrect = () => {
  vibrate([50, 50, 50]);
  sendAction('correct');
};

const handleSkip = () => {
  if (currentWordData && currentWordData.skipsLeft > 0) {
    vibrate(100);
    sendAction('skip');
  }
};

document.getElementById('btn-correct').addEventListener('click', handleCorrect);
document.getElementById('btn-skip').addEventListener('click', handleSkip);

// Swipe Logic for Word Card
let startX = 0;
let currentX = 0;
let isDragging = false;
let cardEl = null;

const initCard = () => {
  const container = document.getElementById('word-card-container');
  container.innerHTML = '';
  if (!currentWordData) return;
  
  cardEl = document.createElement('div');
  cardEl.className = 'word-card';
  cardEl.textContent = currentWordData.word;
  container.appendChild(cardEl);
  
  cardEl.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX;
    cardEl.classList.add('swiping');
    cardEl.setPointerCapture(e.pointerId);
  });
  
  cardEl.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    currentX = e.clientX - startX;
    const rotate = currentX * 0.1;
    cardEl.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
    
    if (currentX > 50) {
      cardEl.classList.add('swipe-right');
      cardEl.classList.remove('swipe-left');
    } else if (currentX < -50) {
      cardEl.classList.add('swipe-left');
      cardEl.classList.remove('swipe-right');
    } else {
      cardEl.classList.remove('swipe-right', 'swipe-left');
    }
  });
  
  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    cardEl.classList.remove('swiping', 'swipe-right', 'swipe-left');
    
    if (currentX > 90) {
      // Swiped right (Correct)
      handleCorrect();
    } else if (currentX < -90) {
      // Swiped left (Skip)
      handleSkip();
    } else {
      // Reset
      cardEl.style.transform = '';
    }
    currentX = 0;
  };
  
  cardEl.addEventListener('pointerup', endDrag);
  cardEl.addEventListener('pointercancel', endDrag);
};

// Desktop keyboard support
window.addEventListener('keydown', (e) => {
  if (gameState && gameState.status === 'playing' && getMyPlayer() && gameState.currentTurn.actorId === playerId) {
    if (e.key === 'ArrowRight') handleCorrect();
    if (e.key === 'ArrowLeft') handleSkip();
  }
});

// Timer Logic
const updateTimerDisplay = (endTime) => {
  const now = Date.now();
  const left = Math.max(0, Math.ceil((endTime - now) / 1000));
  
  document.getElementById('actor-timer').textContent = left;
  const obsTimer = document.getElementById('observer-timer');
  obsTimer.textContent = left;
  
  if (left <= 10 && left > 0) {
    obsTimer.classList.add('pulse');
  } else {
    obsTimer.classList.remove('pulse');
  }
  
  if (left === 0) {
    obsTimer.classList.remove('pulse');
    vibrate([200, 100, 200, 100, 400]);
  }
};

const startLocalTimer = (endTime) => {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay(endTime);
  timerInterval = setInterval(() => {
    updateTimerDisplay(endTime);
  }, 1000);
};

// Socket Events
socket.on('connect', () => {
  if (playerName) {
    socket.emit('player:join', { playerId, name: playerName });
  }
});

socket.on('actor:word', (data) => {
  currentWordData = data;
  if (cardEl) {
    // animate out old card if needed? Or just replace
    initCard();
  } else {
    initCard();
  }
  
  const btnSkip = document.getElementById('btn-skip');
  const skipsText = document.getElementById('skips-left-text');
  skipsText.textContent = `(${data.skipsLeft})`;
  if (data.skipsLeft <= 0) {
    btnSkip.disabled = true;
  } else {
    btnSkip.disabled = false;
  }
});

socket.on('state:update', (state) => {
  gameState = state;
  const me = getMyPlayer();
  
  if (!me) {
    showView('join');
    updateThemeColor(null);
    return;
  }
  
  updateThemeColor(me.team);
  
  if (state.status === 'lobby') {
    showView('lobby');
    document.getElementById('lobby-team-name').textContent = me.team === 'red' ? 'Team Red' : 'Team Blue';
    document.getElementById('lobby-team-text').textContent = me.team === 'red' ? 'Team Red' : 'Team Blue';
    document.getElementById('lobby-team-text').className = me.team === 'red' ? 'text-red' : 'text-blue';
    releaseWakeLock();
    if (timerInterval) clearInterval(timerInterval);
  }
  
  else if (state.status === 'ready') {
    showView('ready');
    releaseWakeLock();
    if (timerInterval) clearInterval(timerInterval);
    
    const isMyTurn = state.currentTurn.actorId === playerId;
    const actor = state.players[state.currentTurn.actorId];
    const actorName = actor ? actor.name : 'Someone';
    
    document.getElementById('ready-actor-controls').style.display = isMyTurn ? 'block' : 'none';
    
    if (isMyTurn) {
      document.getElementById('ready-title').textContent = "You're up!";
      document.getElementById('ready-subtitle').textContent = "Get ready to act.";
    } else if (actor && actor.team === me.team) {
      document.getElementById('ready-title').textContent = "Get ready";
      document.getElementById('ready-subtitle').textContent = `${actorName} is acting for your team.`;
    } else {
      const otherTeam = actor ? actor.team : 'The other team';
      const capTeam = otherTeam.charAt(0).toUpperCase() + otherTeam.slice(1);
      document.getElementById('ready-title').textContent = "Hold tight";
      document.getElementById('ready-subtitle').textContent = `Team ${capTeam} is up next. No hints!`;
    }
    
    const summary = state.lastTurnSummary;
    const summaryEl = document.getElementById('last-turn-summary');
    if (summary) {
      summaryEl.style.display = 'block';
      document.getElementById('summary-title').textContent = `Last Turn: ${summary.actorName}`;
      document.getElementById('summary-text').textContent = `Team ${summary.team === 'red' ? 'Red' : 'Blue'} +${summary.correctCount}`;
      document.getElementById('summary-text').className = summary.team === 'red' ? 'text-red' : 'text-blue';
    } else {
      summaryEl.style.display = 'none';
    }
  }
  
  else if (state.status === 'playing') {
    const isMyTurn = state.currentTurn.actorId === playerId;
    
    if (isMyTurn) {
      showView('playingActor');
      requestWakeLock();
      document.getElementById('actor-correct').textContent = `${state.currentTurn.correctCount} Correct`;
      if (!currentWordData) {
        document.getElementById('word-card-container').innerHTML = ''; // wait for actor:word
      }
    } else {
      showView('playingObserver');
      releaseWakeLock();
      const actor = state.players[state.currentTurn.actorId];
      if (actor && actor.team === me.team) {
        document.getElementById('observer-title').textContent = "Guess!";
      } else {
        const teamName = actor ? (actor.team === 'red' ? 'Team Red' : 'Team Blue') : 'Other team';
        document.getElementById('observer-title').textContent = `${teamName} is guessing`;
      }
      document.getElementById('observer-correct').textContent = `${state.currentTurn.correctCount} Correct`;
    }
    
    if (state.currentTurn.endTime) {
      startLocalTimer(state.currentTurn.endTime);
    }
  }
  
  else if (state.status === 'over') {
    showView('over');
    releaseWakeLock();
    if (timerInterval) clearInterval(timerInterval);
    
    const redScore = state.scores.red;
    const blueScore = state.scores.blue;
    let winner = 'tie';
    if (redScore > blueScore) winner = 'red';
    if (blueScore > redScore) winner = 'blue';
    
    if (winner === 'tie') {
      document.getElementById('over-subtitle').textContent = "It's a tie!";
      document.getElementById('over-subtitle').className = 'text-ink';
    } else if (winner === me.team) {
      document.getElementById('over-subtitle').textContent = "Your team wins!";
      document.getElementById('over-subtitle').className = winner === 'red' ? 'text-white' : 'text-white';
    } else {
      document.getElementById('over-subtitle').textContent = `Team ${winner === 'red' ? 'Red' : 'Blue'} Wins`;
      document.getElementById('over-subtitle').className = 'text-ink';
    }
  }
});
