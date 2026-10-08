const socket = io();

// State
let gameState = null;
let timerInterval = null;

// DOM Elements
const views = {
  auth: document.getElementById('view-auth'),
  lobby: document.getElementById('view-lobby'),
  playing: document.getElementById('view-playing'),
  over: document.getElementById('view-over')
};

const showView = (viewName) => {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
};

// Auth
let storedPin = sessionStorage.getItem('charades_host_pin') || '';

const attemptAuth = (pin) => {
  socket.emit('host:join', { pin });
};

if (storedPin) {
  attemptAuth(storedPin);
}

document.getElementById('btn-login').addEventListener('click', () => {
  const pin = document.getElementById('host-pin').value;
  attemptAuth(pin);
});

socket.on('host:auth', (success) => {
  if (success) {
    const pin = document.getElementById('host-pin').value || storedPin;
    sessionStorage.setItem('charades_host_pin', pin);
    // State update will trigger view change
  } else {
    alert("Incorrect PIN");
    sessionStorage.removeItem('charades_host_pin');
    showView('auth');
  }
});

socket.on('host:url', (url) => {
  if (url) {
    document.getElementById('join-url').textContent = url;
  } else {
    document.getElementById('join-url').textContent = window.location.origin;
  }
});

// Socket State
socket.on('state:update', (state) => {
  gameState = state;
  render();
});

socket.on('disconnect', () => {
  document.getElementById('disconnected-warning').style.display = 'block';
});
socket.on('connect', () => {
  document.getElementById('disconnected-warning').style.display = 'none';
  if (sessionStorage.getItem('charades_host_pin')) {
    attemptAuth(sessionStorage.getItem('charades_host_pin'));
  }
});

// Actions
document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('host:action', { type: 'start' });
});

document.getElementById('btn-shuffle').addEventListener('click', () => {
  socket.emit('host:action', { type: 'shuffle_teams' });
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if(confirm("Clear all players?")) {
    socket.emit('host:action', { type: 'clear_players' });
  }
});

document.getElementById('btn-end-turn').addEventListener('click', () => {
  socket.emit('host:action', { type: 'skip_turn' });
});

document.getElementById('btn-skip-actor').addEventListener('click', () => {
  socket.emit('host:action', { type: 'skip_turn' });
});

document.getElementById('btn-end-game').addEventListener('click', () => {
  if(confirm("End the game now?")) {
    socket.emit('host:action', { type: 'end' });
  }
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('host:action', { type: 'start' });
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  socket.emit('host:action', { type: 'clear_players' });
  socket.emit('host:action', { type: 'end' }); // Go back to lobby basically by clearing players and we are in over state? Wait, if we clear players we need to go to lobby.
  // Actually, setting state to lobby is not an action. The server sets to lobby implicitly if we restart? No, server doesn't have a lobby transition from over except 'start'.
  // We can just add a 'to_lobby' action or handle it. Wait, I'll send 'to_lobby' to server.
  socket.emit('host:action', { type: 'to_lobby' });
});

// Helper for rendering player list
const renderPlayers = () => {
  const redList = document.getElementById('list-red');
  const blueList = document.getElementById('list-blue');
  redList.innerHTML = '';
  blueList.innerHTML = '';
  
  const players = Object.values(gameState.players);
  let redCount = 0;
  let blueCount = 0;
  
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = `player-item ${p.connected ? '' : 'offline'}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name + (p.connected ? '' : ' (offline)');
    
    const moveBtn = document.createElement('button');
    moveBtn.innerHTML = '⇌';
    moveBtn.className = 'btn btn-white';
    moveBtn.style.padding = '0.25rem 0.5rem';
    moveBtn.style.fontSize = '1rem';
    moveBtn.onclick = () => {
      socket.emit('host:action', { type: 'move_player', playerId: p.id });
    };
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '×';
    delBtn.className = 'btn btn-white text-red';
    delBtn.style.padding = '0.25rem 0.5rem';
    delBtn.style.fontSize = '1rem';
    delBtn.style.borderColor = 'var(--red)';
    delBtn.onclick = () => {
      socket.emit('host:action', { type: 'remove_player', playerId: p.id });
    };
    
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '0.5rem';
    controls.appendChild(moveBtn);
    controls.appendChild(delBtn);
    
    div.appendChild(nameSpan);
    div.appendChild(controls);
    
    if (p.team === 'red') {
      redList.appendChild(div);
      redCount++;
    } else {
      blueList.appendChild(div);
      blueCount++;
    }
  });
  
  document.getElementById('count-red').textContent = redCount;
  document.getElementById('count-blue').textContent = blueCount;
  
  const btnStart = document.getElementById('btn-start-game');
  if (redCount > 0 && blueCount > 0) {
    btnStart.disabled = false;
  } else {
    btnStart.disabled = true;
  }
};

// Render Loop
const render = () => {
  if (!gameState) return;
  
  if (gameState.status === 'lobby') {
    showView('lobby');
    renderPlayers();
  }
  
  else if (gameState.status === 'ready' || gameState.status === 'playing') {
    showView('playing');
    
    document.getElementById('score-val-red').textContent = gameState.scores.red;
    document.getElementById('score-val-blue').textContent = gameState.scores.blue;
    
    const team = gameState.currentTurn.team;
    document.getElementById('score-red').classList.toggle('active', team === 'red');
    document.getElementById('score-blue').classList.toggle('active', team === 'blue');
    
    const actor = gameState.players[gameState.currentTurn.actorId];
    document.getElementById('current-actor-name').textContent = actor ? actor.name : 'Unknown';
    document.getElementById('current-actor-team').textContent = team === 'red' ? 'Team Red' : 'Team Blue';
    document.getElementById('current-actor-team').className = team === 'red' ? 'text-red' : 'text-blue';
    
    document.getElementById('turn-correct-count').textContent = `${gameState.currentTurn.correctCount} Correct`;
    
    if (gameState.status === 'playing') {
      document.getElementById('btn-end-turn').style.display = 'block';
      document.getElementById('btn-skip-actor').style.display = 'none';
      if (gameState.currentTurn.endTime) {
        startLocalTimer(gameState.currentTurn.endTime);
      }
    } else {
      document.getElementById('btn-end-turn').style.display = 'none';
      document.getElementById('btn-skip-actor').style.display = 'block';
      if (timerInterval) clearInterval(timerInterval);
      document.getElementById('host-timer').textContent = gameState.settings.turnSeconds;
      document.getElementById('host-timer').classList.remove('pulse');
    }
    
    // Add chips for last turn (create if not exist)
    let chipsContainer = document.getElementById('chips-container');
    if (!chipsContainer) {
      chipsContainer = document.createElement('div');
      chipsContainer.id = 'chips-container';
      chipsContainer.className = 'chips-container';
      document.querySelector('.center-panel').appendChild(chipsContainer);
    }
    
    // Render chips
    chipsContainer.innerHTML = '';
    if (gameState.status === 'ready' && gameState.lastTurnSummary && gameState.lastTurnSummary.wordsPlayed) {
      const summaryHeader = document.createElement('div');
      summaryHeader.style.width = '100%';
      summaryHeader.style.textAlign = 'center';
      summaryHeader.style.fontWeight = '700';
      summaryHeader.style.marginTop = '1rem';
      summaryHeader.style.fontSize = '1.25rem';
      summaryHeader.textContent = `Last Turn: ${gameState.lastTurnSummary.actorName} (${gameState.lastTurnSummary.correctCount} correct)`;
      chipsContainer.appendChild(summaryHeader);
      
      gameState.lastTurnSummary.wordsPlayed.forEach(w => {
        const chip = document.createElement('div');
        chip.className = `chip ${w.status === 'correct' ? 'correct' : 'skipped'}`;
        chip.textContent = w.word;
        chipsContainer.appendChild(chip);
      });
    }
  }
  
  else if (gameState.status === 'over') {
    showView('over');
    if (timerInterval) clearInterval(timerInterval);
    
    document.getElementById('final-score-red').textContent = gameState.scores.red;
    document.getElementById('final-score-blue').textContent = gameState.scores.blue;
    
    const redScore = gameState.scores.red;
    const blueScore = gameState.scores.blue;
    const title = document.getElementById('over-winner');
    
    if (redScore > blueScore) {
      title.textContent = "Team Red Wins!";
      title.className = "text-red";
    } else if (blueScore > redScore) {
      title.textContent = "Team Blue Wins!";
      title.className = "text-blue";
    } else {
      title.textContent = "It's a Tie!";
      title.className = "text-ink";
    }
  }
};

const updateTimerDisplay = (endTime) => {
  const now = Date.now();
  const left = Math.max(0, Math.ceil((endTime - now) / 1000));
  
  const timerEl = document.getElementById('host-timer');
  timerEl.textContent = left;
  
  if (left <= 10 && left > 0) {
    timerEl.classList.add('pulse');
  } else {
    timerEl.classList.remove('pulse');
  }
};

const startLocalTimer = (endTime) => {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay(endTime);
  timerInterval = setInterval(() => {
    updateTimerDisplay(endTime);
  }, 1000);
};

// Settings Modal
const modalSettings = document.getElementById('modal-settings');
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('set-time').value = gameState.settings.turnSeconds;
  document.getElementById('set-skips').value = gameState.settings.skipsPerTurn;
  document.getElementById('set-words').value = gameState.settings.words.join('\n');
  modalSettings.classList.remove('hidden');
});

document.getElementById('btn-cancel-settings').addEventListener('click', () => {
  modalSettings.classList.add('hidden');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const turnSeconds = parseInt(document.getElementById('set-time').value, 10) || 60;
  const skipsPerTurn = parseInt(document.getElementById('set-skips').value, 10) || 3;
  const wordsText = document.getElementById('set-words').value;
  const words = wordsText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
  
  socket.emit('host:action', {
    type: 'settings',
    settings: {
      turnSeconds,
      skipsPerTurn,
      words: [...new Set(words)] // dedup
    }
  });
  
  modalSettings.classList.add('hidden');
});
