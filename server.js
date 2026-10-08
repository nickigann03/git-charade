require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST_PIN = process.env.HOST_PIN || '1234';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Default Words
const DEFAULT_WORDS = [
  "Restart your computer", "Password reset", "Printer jam", "Wi-Fi not working", "Computer virus",
  "Hacker", "Backup", "Copy and paste", "Downloading", "Spam email", "Robot", "Selfie", "Software update",
  "Server down", "Typing very fast", "Charging your phone", "Battery at 1%", "Forgot password", "Video call freezing",
  "Unplug and plug back in", "Mouse not working", "Scanning a QR code", "Laptop overheating", "Dropped your phone",
  "Firewall", "Phishing email", "Blue screen of death", "Two-factor authentication", "You're on mute", "Sharing your screen",
  "AI chatbot", "Ransomware", "Data centre", "Ctrl Alt Delete", "Legacy system", "Go-live", "Rollback", "Scope creep",
  "Digital transformation", "Change request", "Deadline", "Coffee break", "Meeting that should have been an email",
  "Out of office", "Overtime", "Pay day", "Monday morning", "Sleeping in a meeting", "Boss walking past", "Annual leave",
  "Giving a presentation", "Budget cut", "Team building", "Waiting for approval", "Lunch break", "Stuck in the lift",
  "Reply all", "Signing a contract", "Job interview", "Photocopier", "Fire drill", "Performance review", "Teh tarik",
  "Roti canai", "Durian", "Nasi lemak", "Mamak", "Stuck in traffic", "Looking for parking", "Hari Raya open house",
  "Angpow", "Afternoon thunderstorm", "Grab driver", "Touch 'n Go", "Badminton", "Karaoke", "Mahjong", "MRT", "Satay",
  "Lion dance", "Pasar malam", "Cendol", "Bak kut teh", "Titanic", "Spider-Man", "Harry Potter", "Squid Game",
  "Jurassic Park", "Frozen", "Mission Impossible", "The Matrix", "Upin & Ipin", "Ultraman", "The Lion King", "Avengers",
  "Star Wars", "Kung Fu Panda", "Doraemon", "Shrek"
];

// Game State
let gameState = {
  status: 'lobby',
  players: {}, // id: { id, name, team, connected, joinedAt, socketId }
  settings: {
    turnSeconds: 60,
    skipsPerTurn: 3,
    words: [...DEFAULT_WORDS]
  },
  deck: [],
  scores: { red: 0, blue: 0 },
  currentTurn: {
    team: 'red',
    actorId: null,
    endTime: null,
    skipsLeft: 3,
    correctCount: 0,
    skippedCount: 0,
    currentWord: null,
    wordSeq: 0,
    wordsPlayed: []
  },
  lastTurnSummary: null,
  turnRotation: { red: 0, blue: 0 }
};

let turnTimeout = null;

// Helpers
const getActivePlayers = (team) => {
  return Object.values(gameState.players)
    .filter(p => p.team === team)
    .sort((a, b) => a.joinedAt - b.joinedAt);
};

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const prepareDeck = () => {
  const words = gameState.settings.words.map(w => w.trim()).filter(w => w.length > 0);
  const uniqueWords = [...new Set(words)];
  gameState.deck = shuffleArray(uniqueWords);
};

const drawWord = () => {
  if (gameState.deck.length === 0) {
    prepareDeck();
  }
  return gameState.deck.pop() || "No words left!";
};

const broadcastState = () => {
  const publicState = { ...gameState, currentTurn: { ...gameState.currentTurn, currentWord: null } };
  io.emit('state:update', publicState);
  
  // Send the actual word only to the actor
  if (gameState.status === 'playing' && gameState.currentTurn.actorId) {
    const actor = gameState.players[gameState.currentTurn.actorId];
    if (actor && actor.socketId) {
      io.to(actor.socketId).emit('actor:word', {
        word: gameState.currentTurn.currentWord,
        wordSeq: gameState.currentTurn.wordSeq,
        skipsLeft: gameState.currentTurn.skipsLeft
      });
    }
  }
};

const endTurn = () => {
  if (turnTimeout) clearTimeout(turnTimeout);
  
  const actor = gameState.players[gameState.currentTurn.actorId];
  gameState.lastTurnSummary = {
    team: gameState.currentTurn.team,
    actorName: actor ? actor.name : 'Unknown',
    correctCount: gameState.currentTurn.correctCount,
    skippedCount: gameState.currentTurn.skippedCount,
    wordsPlayed: [...gameState.currentTurn.wordsPlayed]
  };
  
  // Advance rotation
  const team = gameState.currentTurn.team;
  gameState.turnRotation[team]++;
  
  // Switch team
  const nextTeam = team === 'red' ? 'blue' : 'red';
  const players = getActivePlayers(nextTeam);
  
  if (players.length > 0) {
    gameState.currentTurn.team = nextTeam;
    const actorIndex = gameState.turnRotation[nextTeam] % players.length;
    gameState.currentTurn.actorId = players[actorIndex].id;
  } else {
    // If next team has no players, stay on same team or just pick anyone
    const sameTeamPlayers = getActivePlayers(team);
    if (sameTeamPlayers.length > 0) {
      const actorIndex = gameState.turnRotation[team] % sameTeamPlayers.length;
      gameState.currentTurn.actorId = sameTeamPlayers[actorIndex].id;
    } else {
      gameState.currentTurn.actorId = null;
    }
  }
  
  gameState.status = 'ready';
  broadcastState();
};

const startGame = () => {
  gameState.scores = { red: 0, blue: 0 };
  gameState.turnRotation = { red: 0, blue: 0 };
  gameState.lastTurnSummary = null;
  prepareDeck();
  
  const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
  gameState.currentTurn.team = startingTeam;
  
  const players = getActivePlayers(startingTeam);
  if (players.length > 0) {
    gameState.currentTurn.actorId = players[0].id;
  }
  
  gameState.status = 'ready';
  broadcastState();
};

// Routes
app.get('/qr.png', async (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  const url = process.env.PUBLIC_URL || `${protocol}://${host}`;
  try {
    const qrBuffer = await QRCode.toBuffer(url, { width: 400, margin: 2, color: { dark: '#181B30', light: '#ffffff' } });
    res.type('png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Failed to generate QR');
  }
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Sockets
io.on('connection', (socket) => {
  // Player Join
  socket.on('player:join', (data) => {
    const { playerId, name } = data;
    if (!playerId) return;
    
    let player = gameState.players[playerId];
    
    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      if (name) player.name = name; // Update name if provided
    } else if (name) {
      // New player
      const redCount = getActivePlayers('red').length;
      const blueCount = getActivePlayers('blue').length;
      let team = 'red';
      if (redCount > blueCount) team = 'blue';
      else if (redCount === blueCount) team = Math.random() < 0.5 ? 'red' : 'blue';
      
      player = {
        id: playerId,
        name: name.substring(0, 24),
        team,
        connected: true,
        joinedAt: Date.now(),
        socketId: socket.id
      };
      gameState.players[playerId] = player;
    }
    
    socket.join(socket.id); // join their own room
    
    socket.emit('state:update', { ...gameState, currentTurn: { ...gameState.currentTurn, currentWord: null } });
    if (gameState.status === 'playing' && gameState.currentTurn.actorId === playerId) {
      socket.emit('actor:word', {
        word: gameState.currentTurn.currentWord,
        wordSeq: gameState.currentTurn.wordSeq,
        skipsLeft: gameState.currentTurn.skipsLeft
      });
    }
    broadcastState();
  });
  
  // Host Join
  socket.on('host:join', (data) => {
    if (data.pin === HOST_PIN) {
      socket.join('host');
      socket.emit('host:auth', true);
      socket.emit('state:update', { ...gameState, currentTurn: { ...gameState.currentTurn, currentWord: null } });
      socket.emit('host:url', process.env.PUBLIC_URL || null);
    } else {
      socket.emit('host:auth', false);
    }
  });

  // Host Actions
  socket.on('host:action', (data) => {
    if (!socket.rooms.has('host')) return;
    
    if (data.type === 'start') {
      startGame();
    } else if (data.type === 'end') {
      gameState.status = 'over';
      if (turnTimeout) clearTimeout(turnTimeout);
      broadcastState();
    } else if (data.type === 'skip_turn') {
      endTurn();
    } else if (data.type === 'settings') {
      gameState.settings = { ...gameState.settings, ...data.settings };
      broadcastState();
    } else if (data.type === 'shuffle_teams') {
      const players = Object.values(gameState.players);
      shuffleArray(players).forEach((p, i) => {
        p.team = i % 2 === 0 ? 'red' : 'blue';
      });
      broadcastState();
    } else if (data.type === 'clear_players') {
      gameState.players = {};
      broadcastState();
    } else if (data.type === 'move_player') {
      const p = gameState.players[data.playerId];
      if (p) {
        p.team = p.team === 'red' ? 'blue' : 'red';
        broadcastState();
      }
    } else if (data.type === 'remove_player') {
      delete gameState.players[data.playerId];
      broadcastState();
    } else if (data.type === 'to_lobby') {
      gameState.status = 'lobby';
      broadcastState();
    }
  });
  
  // Player Actions
  socket.on('player:action', (data) => {
    const { playerId, action, wordSeq } = data;
    if (gameState.status !== 'playing' && action !== 'start_turn') return;
    if (gameState.currentTurn.actorId !== playerId) return;
    
    if (action === 'start_turn' && gameState.status === 'ready') {
      gameState.status = 'playing';
      gameState.currentTurn.endTime = Date.now() + (gameState.settings.turnSeconds * 1000);
      gameState.currentTurn.correctCount = 0;
      gameState.currentTurn.skippedCount = 0;
      gameState.currentTurn.skipsLeft = gameState.settings.skipsPerTurn;
      gameState.currentTurn.currentWord = drawWord();
      gameState.currentTurn.wordSeq = 1;
      gameState.currentTurn.wordsPlayed = [];
      
      turnTimeout = setTimeout(() => {
        endTurn();
      }, gameState.settings.turnSeconds * 1000 + 500); // 500ms grace period
      
      broadcastState();
      return;
    }
    
    if (gameState.status === 'playing' && Date.now() < gameState.currentTurn.endTime && wordSeq === gameState.currentTurn.wordSeq) {
      if (action === 'correct') {
        gameState.currentTurn.wordsPlayed.push({ word: gameState.currentTurn.currentWord, status: 'correct' });
        gameState.currentTurn.correctCount++;
        gameState.scores[gameState.currentTurn.team]++;
        gameState.currentTurn.currentWord = drawWord();
        gameState.currentTurn.wordSeq++;
        broadcastState();
      } else if (action === 'skip' && gameState.currentTurn.skipsLeft > 0) {
        gameState.currentTurn.wordsPlayed.push({ word: gameState.currentTurn.currentWord, status: 'skipped' });
        gameState.currentTurn.skippedCount++;
        gameState.currentTurn.skipsLeft--;
        gameState.currentTurn.currentWord = drawWord();
        gameState.currentTurn.wordSeq++;
        broadcastState();
      }
    }
  });
  
  socket.on('disconnect', () => {
    // Find player with this socket
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      broadcastState();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
