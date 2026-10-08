# Charades Showdown

A real-time multiplayer charades web app designed for office team-building sessions. 
Host runs the game on a big screen/projector, while players use their phones as buzzers/word cards.

## Features
- Real-time WebSockets synchronization (Socket.IO).
- Mobile-first player interface with Tinder-like swipe gestures.
- Host dashboard for managing teams, tracking scores, and customizing game settings.
- Server authoritative game state to prevent cheating or clock desync.

## Environment Variables
- `PORT` (Optional): Port to run the server on. Default is 3000.
- `HOST_PIN` (Optional): PIN for the host to log in. Default is `1234`.
- `PUBLIC_URL` (Optional): The public URL of the deployed application. If set, this URL is used to generate the join QR code.

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```
   
3. To play locally on a single Wi-Fi network, navigate to `http://localhost:3000/host` on your projector computer, and players can join by scanning the QR code on the screen or going to the same IP.
   - For remote players, you can use a tunnel like `ngrok` or `localtunnel` pointing to port 3000.
   - Example: `npx localtunnel --port 3000`

## Deployment

### Deploying to Render (Recommended)
Render natively supports long-running Node.js processes and WebSockets, making it a perfect fit for this game.

1. Push your code to GitHub.
2. Log into Render and create a new **Web Service**, linking this repository.
3. Use the following settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add Environment Variables:
   - `HOST_PIN`: Set your secure pin (e.g., `1234`)
   - `PUBLIC_URL`: Your Render URL (e.g., `https://my-charades.onrender.com`)
5. Click **Deploy**!

### Docker
You can also run the application using Docker on any host that supports it:

```bash
docker build -t charades-showdown .
docker run -p 3000:3000 -e HOST_PIN=1234 charades-showdown
```

## How to Play
1. The **Host** opens `/host`, enters the PIN, and displays the screen on a projector.
2. **Players** scan the QR code to open the game on their phones and enter their names to join.
3. The game automatically balances players into Team Red and Team Blue.
4. The host presses "Start Game".
5. When it's a player's turn, they press "Start My Turn" on their phone and act out the words on their screen.
   - Swipe Right (or tap Got It) for correct guesses.
   - Swipe Left (or tap Skip) to skip.
6. The team with the most points when the host ends the game wins!
