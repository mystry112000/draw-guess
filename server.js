const http = require('http')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')

const PORT = 8080
const WORDS = {
  easy: ['cat','dog','sun','moon','star','fish','bird','tree','house','car','apple','ball','book','cake','cloud','cup','door','egg','fish','flower','hat','key','lamp','leaf','lock','nest','pen','ring','shoe','sock','tree','umbrella','watch','ball','boat','bell','bean','bear','bee','chair','crown','desk','drum','duck','eye','fork','frog','game','gift','glove','golf','grass','hammer','heart','hill','horse','ice','jar','kite','knife','ladder','leaf','lego','lemon','lion','lock','lunch','map','milk','mirror','moon','mug','nail','nest','nose','note','orange','paint','panda','pan','pear','piano','pillow','pizza','plane','plant','plate','pencil','pill','pine','pirate','pond','potato','rain','rainbow','robot','rocket','rose','sand','scarf','ship','shirt','skate','snake','snow','spoon','star','stool','sun','sword','tent','tiger','tooth','train','trumpet','turtle','unicorn','van','violin','volcano','wagon','wallet','watch','whale','wheel','whistle','wind','window','wolf','worm','zebra'],
  medium: ['airport','airplane','anchor','apartment','backpack','balloon','banana','baseball','basket','battery','beach','beard','bedroom','bicycle','binoculars','blanket','blueberry','bookshelf','bottle','bowling','bracelet','breakfast','broom','bucket','butterfly','cabin','cactus','calculator','candle','candy','canyon','carpet','castle','catapult','ceiling','cellphone','cereal','chandelier','cheese','cherry','chicken','chimney','chocolate','church','circus','cliff','clock','clown','coconut','compass','concert','computer','cookie','coral','corn','cotton','couch','crab','crayon','crystal','cucumber','cupcake','dinosaur','dolphin','donut','dragon','drawer','drum','eagle','elephant','envelope','eraser','espresso','falcon','ferris','fire','fireman','flag','flashlight','flute','football','forest','fountain','fox','freeway','frisbee','frying','galaxy','garage','garden','garlic','giraffe','glacier','glasses','glitter','globe','goal','goblin','goggles','guitar','hamburger','hamster','harbor','helicopter','helmet','hiking','hockey','honey','horse','hospital','hotdog','hotpot','humming','hurricane','igloo','island','jacket','jail','jelly','jigsaw','juice','jungle','kangaroo','karate','kayak','kettle','kitchen','kitten','knight','kitchen','koala','lantern','laptop','laser','lighthouse','limousine','lobster','lollipop','magazine','magnet','mailbox','mansion','marathon','marshmallow','mascot','mayonnaise','meadow','megaphone','melting','microscope','microwave','milestone','minigolf','mission','mistake','monument','mosquito','mountain','muffin','museum','mushroom','mustard','nachos','napkin','necklace','newspaper','nightstand','notebook','octopus','orange','orchestra','origami','ostrich','outhouse','painting','pajama','palace','parachute','parade','park','parrot','passenger','passport','peacock','peanut','penguin','perfume','phoenix','piano','picnic','pickup','pillow','pirate','planet','playground','plumber','polar','popcorn','portrait','postcard','potato','pretzel','princess','printer','pudding','pumpkin','pyramid','question','rabbit','raccoon','radiator','radio','rainbow','ravioli','recorder','refrigerator','rhinoceros','ribbon','ring','rocket','robot','roller','rose','roulette','sailboat','salad','sandwich','saucer','saxophone','scarecrow','scooter','scorpion','scramble','seahorse','seashore','seesaw','skeleton','skyscraper','snail','snowman','soccer','socks','sofa','soldier','spaceship','spaghetti','sparrow','spider','sponge','sprinkler','squirrel','starfish','station','steak','steering','stethoscope','stingray','strawberry','street','submarine','suitcase','sunflower','surfboard','swimming','swordfish','symphony','syringe','table','taco','telescope','television','tennis','thunder','tornado','tractor','trampoline','triangle','trombone','tropical','trumpet','tunnel','tuxedo','typewriter','unicycle','unicorn','valentine','vampire','vegetable','village','violin','volcano','volleyball','waffle','waterfall','watermelon','whistle','windmill','windshield','workshop','xylophone','yogurt','zebra','zipper','zombie'],
  hard: ['astronaut','bathroom','basketball','blackboard','breakfast','caterpillar','chameleon','chandelier','christmas','crocodile','dictionary','dinosaur','electrician','firefighter','fireworks','furniture','gentleman','grandfather','grandmother','headphones','helicopter','hospitals','icecream','illustrator','intelligence','internet','kangaroo','kitchen','laboratory','landscape','lighthouse','magazine','motorcycle','mountains','nightstand','orchestra','parliament','pharmacy','photograph','pineapple','playground','playstation','postoffice','pumpkin','rainforest','refrigerator','restaurant','rollercoaster','schoolbus','scoobydoo','skateboard','snowboarding','strawberry','submarine','supermarket','telescope','tenniscourt','television','trampoline','trapezeartist','treasure','trombone','umbrella','university','vegetables','volleyball','waterfall','wheelchair','xylophone','yacht','yellowstone','yesterday']
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    })
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

const wss = new WebSocketServer({ server })

const rooms = new Map()

function createRoom(id, hostId) {
  return {
    id,
    hostId,
    players: new Map(),
    state: 'waiting',
    round: 0,
    totalRounds: 3,
    word: '',
    wordCategory: '',
    drawerId: null,
    timer: 0,
    timerInterval: null,
    guesses: new Set(),
    revealed: false,
    canvas: [],
    roundStartTime: 0,
  }
}

function startGame(room) {
  const playerIds = Array.from(room.players.keys())
  if (playerIds.length < 2) return

  room.state = 'playing'
  room.round = 1
  room.guesses = new Set()
  room.revealed = false
  room.canvas = []

  startRound(room)
}

function startRound(room) {
  const playerIds = Array.from(room.players.keys())
  const drawerId = playerIds[(room.round - 1) % playerIds.length]
  room.drawerId = drawerId
  room.guesses = new Set()
  room.revealed = false
  room.canvas = []

  const difficulty = room.round <= 2 ? 'easy' : 'medium'
  const words = WORDS[difficulty]
  const word = words[Math.floor(Math.random() * words.length)]
  room.word = word
  room.wordCategory = difficulty
  room.roundStartTime = Date.now()
  room.timer = 90

  broadcast(room, { type: 'round_start', round: room.round, totalRounds: room.totalRounds, drawerId, word: room.drawerId === room.drawerId ? word : '', timer: 90, isDrawer: false })

  for (const [id, player] of room.players) {
    const isDrawer = id === drawerId
    send(player.ws, { type: 'round_start', round: room.round, totalRounds: room.totalRounds, drawerId, word: isDrawer ? word : '', timer: 90, isDrawer, wordReveal: isDrawer ? word.split('').map(() => '_') : null })
  }

  if (room.timerInterval) clearInterval(room.timerInterval)
  room.timerInterval = setInterval(() => {
    room.timer--
    if (room.timer <= 0) {
      clearInterval(room.timerInterval)
      room.revealed = true
      endRound(room)
    } else {
      broadcast(room, { type: 'timer', timer: room.timer })
    }
  }, 1000)
}

function endRound(room) {
  if (room.round >= room.totalRounds) {
    endGame(room)
    return
  }

  room.round++
  startRound(room)
}

function endGame(room) {
  clearInterval(room.timerInterval)
  room.state = 'ended'
  const scores = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1 }))
  broadcast(room, { type: 'game_over', scores })
}

function handleGuess(room, playerId, guess) {
  if (room.state !== 'playing' || room.revealed || playerId === room.drawerId) return
  if (room.guesses.has(playerId)) return

  const normalizedGuess = guess.toLowerCase().trim()
  const normalizedWord = room.word.toLowerCase()

  if (normalizedGuess === normalizedWord) {
    const elapsed = (Date.now() - room.roundStartTime) / 1000
    const points = Math.max(10, Math.round(50 - elapsed / 2))
    room.guesses.add(playerId)

    const player = room.players.get(playerId)
    if (player) player.score += points

    const drawer = room.players.get(room.drawerId)
    if (drawer) drawer.score += Math.round(points * 0.3)

    send(room.players.get(playerId)?.ws, { type: 'correct_guess', points, word: room.word })

    broadcast(room, { type: 'player_guessed', playerId, playerName: room.players.get(playerId)?.name || 'Unknown', points })

    if (room.guesses.size >= Array.from(room.players.keys()).filter(id => id !== room.drawerId).length) {
      clearInterval(room.timerInterval)
      setTimeout(() => endRound(room), 2000)
    }
  }
}

function broadcast(room, message) {
  const data = JSON.stringify(message)
  for (const player of room.players.values()) {
    if (player.ws.readyState === 1) player.ws.send(data)
  }
}

function send(ws, message) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(message))
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

wss.on('connection', (ws) => {
  let room = null
  let playerId = null

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data)

      if (msg.type === 'create_room') {
        const roomId = generateRoomId()
        playerId = msg.playerId || crypto.randomUUID().slice(0, 8)
        room = createRoom(roomId, playerId)
        rooms.set(roomId, room)
        room.players.set(playerId, { id: playerId, name: msg.name, ws, score: 0 })
        send(ws, { type: 'room_created', roomId, players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, score: 0 })), isHost: true })
      } else if (msg.type === 'join_room') {
        const existingRoom = rooms.get(msg.roomId)
        if (!existingRoom) { send(ws, { type: 'error', message: 'Room not found' }); return }
        if (existingRoom.players.size >= 8) { send(ws, { type: 'error', message: 'Room is full' }); return }

        playerId = msg.playerId || crypto.randomUUID().slice(0, 8)
        room = existingRoom
        room.players.set(playerId, { id: playerId, name: msg.name, ws, score: 0 })
        send(ws, { type: 'room_joined', roomId: room.id, players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, score: p.score })), isHost: false, state: room.state })
        broadcast(room, { type: 'player_joined', players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, score: p.score })) })
      } else if (msg.type === 'start_game' && room && playerId === room.hostId && room.state === 'waiting') {
        startGame(room)
      } else if (msg.type === 'draw' && room && room.state === 'playing') {
        const data = JSON.stringify({ type: 'draw', stroke: msg.stroke })
        for (const [id, player] of room.players) {
          if (id !== playerId && player.ws.readyState === 1) player.ws.send(data)
        }
      } else if (msg.type === 'clear' && room && room.state === 'playing') {
        broadcast(room, { type: 'clear' })
      } else if (msg.type === 'guess' && room) {
        handleGuess(room, playerId, msg.guess)
      } else if (msg.type === 'chat' && room) {
        const player = room.players.get(playerId)
        broadcast(room, { type: 'chat', playerId, playerName: player?.name || 'Unknown', message: msg.message })
      }
    } catch (e) {
      console.error('Error:', e)
    }
  })

  ws.on('close', () => {
    if (room && playerId && room.players.has(playerId)) {
      room.players.delete(playerId)
      broadcast(room, { type: 'player_left', players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, score: p.score })) })

      if (room.players.size === 0) {
        rooms.delete(room.id)
        if (room.timerInterval) clearInterval(room.timerInterval)
      } else if (room.state === 'playing') {
        if (playerId === room.drawerId) {
          clearInterval(room.timerInterval)
          endRound(room)
        }
        if (room.players.size < 2 && room.state === 'playing') {
          clearInterval(room.timerInterval)
          endGame(room)
        }
      }
    }
  })
})

server.listen(PORT, () => {
  console.log(`Draw & Guess server running!`)
  console.log(`Open http://localhost:${PORT} in your browser`)
  console.log(`Share the URL with friends on the same network`)
})
