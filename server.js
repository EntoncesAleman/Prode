const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

const db = new Database(path.join(__dirname, 'prode.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    joined_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS predictions (
    user_name TEXT,
    match_id TEXT,
    home_score INTEGER,
    away_score INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_name, match_id)
  );
  CREATE TABLE IF NOT EXISTS results (
    match_id TEXT PRIMARY KEY,
    home_score INTEGER,
    away_score INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GROUPS = {
  'A': ['🇺🇸 Estados Unidos', '🇷🇸 Serbia', '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Gales', '🇵🇦 Panamá'],
  'B': ['🇲🇽 México', '🇵🇹 Portugal', '🇺🇾 Uruguay', '🇬🇭 Ghana'],
  'C': ['🇦🇷 Argentina', '🇵🇱 Polonia', '🇸🇦 Arabia Saudita', '🇦🇺 Australia'],
  'D': ['🇫🇷 Francia', '🇩🇰 Dinamarca', '🇹🇳 Túnez', '🇵🇪 Perú'],
  'E': ['🇧🇷 Brasil', '🇨🇭 Suiza', '🇸🇳 Senegal', '🇨🇦 Canadá'],
  'F': ['🏴󠁧󠁢󠁥󠁮󠁧󠁿 Inglaterra', '🇳🇱 Países Bajos', '🇮🇷 Irán', '🇹🇿 Tanzania'],
  'G': ['🇩🇪 Alemania', '🇯🇵 Japón', '🇨🇴 Colombia', '🇲🇦 Marruecos'],
  'H': ['🇪🇸 España', '🇧🇪 Bélgica', '🇨🇷 Costa Rica', '🇯🇴 Jordania'],
};

const GROUP_MATCHES = [];
let mid = 1;
for (const [group, teams] of Object.entries(GROUPS)) {
  const pairs = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i+1; j < teams.length; j++)
      pairs.push([teams[i], teams[j]]);
  const dates = ['11 Jun','12 Jun','13 Jun','14 Jun','15 Jun','16 Jun'];
  pairs.forEach((p, i) => {
    GROUP_MATCHES.push({ id: `g${mid++}`, group, phase: 'Fase de Grupos', home: p[0], away: p[1], date: dates[i%dates.length]+' 2026' });
  });
}

const KNOCKOUT_MATCHES = [
  { id:'r16_1', phase:'Octavos', home:'Primero Grupo A', away:'Segundo Grupo B', date:'26 Jun 2026' },
  { id:'r16_2', phase:'Octavos', home:'Primero Grupo C', away:'Segundo Grupo D', date:'26 Jun 2026' },
  { id:'r16_3', phase:'Octavos', home:'Primero Grupo E', away:'Segundo Grupo F', date:'27 Jun 2026' },
  { id:'r16_4', phase:'Octavos', home:'Primero Grupo G', away:'Segundo Grupo H', date:'27 Jun 2026' },
  { id:'r16_5', phase:'Octavos', home:'Segundo Grupo A', away:'Primero Grupo B', date:'28 Jun 2026' },
  { id:'r16_6', phase:'Octavos', home:'Segundo Grupo C', away:'Primero Grupo D', date:'28 Jun 2026' },
  { id:'r16_7', phase:'Octavos', home:'Segundo Grupo E', away:'Primero Grupo F', date:'29 Jun 2026' },
  { id:'r16_8', phase:'Octavos', home:'Segundo Grupo G', away:'Primero Grupo H', date:'29 Jun 2026' },
  { id:'qf_1', phase:'Cuartos de Final', home:'Ganador O1', away:'Ganador O2', date:'4 Jul 2026' },
  { id:'qf_2', phase:'Cuartos de Final', home:'Ganador O3', away:'Ganador O4', date:'4 Jul 2026' },
  { id:'qf_3', phase:'Cuartos de Final', home:'Ganador O5', away:'Ganador O6', date:'5 Jul 2026' },
  { id:'qf_4', phase:'Cuartos de Final', home:'Ganador O7', away:'Ganador O8', date:'5 Jul 2026' },
  { id:'sf_1', phase:'Semifinales', home:'Ganador CF1', away:'Ganador CF2', date:'14 Jul 2026' },
  { id:'sf_2', phase:'Semifinales', home:'Ganador CF3', away:'Ganador CF4', date:'15 Jul 2026' },
  { id:'final', phase:'Final', home:'Ganador SF1', away:'Ganador SF2', date:'19 Jul 2026' },
];

const ALL_MATCHES = [...GROUP_MATCHES, ...KNOCKOUT_MATCHES];

function getWinner(h,a){ return h>a?'H':a>h?'A':'D'; }
function calcPoints(ph,pa,rh,ra){ if(ph===rh&&pa===ra)return 3; if(getWinner(ph,pa)===getWinner(rh,ra))return 1; return 0; }

function getLeaderboard() {
  const users = db.prepare('SELECT name FROM users').all();
  const resultMap = {};
  db.prepare('SELECT * FROM results').all().forEach(r => resultMap[r.match_id]=r);
  return users.map(u => {
    const preds = db.prepare('SELECT * FROM predictions WHERE user_name=?').all(u.name);
    let pts=0,exact=0,partial=0,resolved=0;
    preds.forEach(p => {
      const r = resultMap[p.match_id]; if(!r)return;
      resolved++;
      const pt = calcPoints(p.home_score,p.away_score,r.home_score,r.away_score);
      pts+=pt; if(pt===3)exact++; else if(pt===1)partial++;
    });
    return { name:u.name, pts, exact, partial, resolved, total_picks:preds.length };
  }).sort((a,b)=>b.pts-a.pts||b.exact-a.exact);
}

app.get('/api/matches', (req,res) => {
  const resultMap = {};
  db.prepare('SELECT * FROM results').all().forEach(r => resultMap[r.match_id]={home:r.home_score,away:r.away_score});
  res.json({ matches: ALL_MATCHES, results: resultMap });
});

app.post('/api/users/login', (req,res) => {
  const { name } = req.body;
  if(!name||name.trim().length<2) return res.status(400).json({error:'Nombre inválido'});
  const clean = name.trim().slice(0,24);
  db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)').run(clean);
  const preds = db.prepare('SELECT * FROM predictions WHERE user_name=?').all(clean);
  const predMap = {};
  preds.forEach(p => predMap[p.match_id]={home:p.home_score,away:p.away_score});
  res.json({ name:clean, predictions:predMap });
});

app.post('/api/predictions', (req,res) => {
  const { user_name, match_id, home_score, away_score } = req.body;
  if(!user_name||!match_id||home_score==null||away_score==null) return res.status(400).json({error:'Datos incompletos'});
  if(!ALL_MATCHES.find(m=>m.id===match_id)) return res.status(400).json({error:'Partido inválido'});
  if(db.prepare('SELECT * FROM results WHERE match_id=?').get(match_id)) return res.status(400).json({error:'Partido ya jugado'});
  db.prepare(`INSERT INTO predictions (user_name,match_id,home_score,away_score,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(user_name,match_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,updated_at=datetime('now')`).run(user_name,match_id,parseInt(home_score),parseInt(away_score));
  res.json({ok:true});
});

app.get('/api/leaderboard', (req,res) => res.json({leaderboard:getLeaderboard()}));

app.get('/api/predictions/:user', (req,res) => {
  const preds = db.prepare('SELECT * FROM predictions WHERE user_name=?').all(req.params.user);
  const predMap = {};
  preds.forEach(p => predMap[p.match_id]={home:p.home_score,away:p.away_score});
  res.json({predictions:predMap});
});

function adminAuth(req,res,next){
  if(req.headers['x-admin-password']!==ADMIN_PASSWORD) return res.status(401).json({error:'No autorizado'});
  next();
}

app.post('/api/admin/results', adminAuth, (req,res) => {
  const { match_id, home_score, away_score } = req.body;
  if(!match_id||home_score==null||away_score==null) return res.status(400).json({error:'Datos incompletos'});
  db.prepare(`INSERT INTO results (match_id,home_score,away_score,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(match_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,updated_at=datetime('now')`).run(match_id,parseInt(home_score),parseInt(away_score));
  res.json({ok:true});
});

app.delete('/api/admin/results/:matchId', adminAuth, (req,res) => {
  db.prepare('DELETE FROM results WHERE match_id=?').run(req.params.matchId);
  res.json({ok:true});
});

app.delete('/api/admin/results', adminAuth, (req,res) => {
  db.prepare('DELETE FROM results').run();
  res.json({ok:true});
});

app.get('/api/admin/users', adminAuth, (req,res) => {
  res.json({users: db.prepare('SELECT * FROM users').all()});
});

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => console.log(`🏆 Prode corriendo en http://localhost:${PORT}`));
