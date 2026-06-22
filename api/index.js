const express = require('express');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change_me';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@example.com';
const PORT = process.env.PORT || 4000;

const docker = new Docker({socketPath: '/var/run/docker.sock'});
const app = express();
app.use(express.json());
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});

function checkAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({error:'unauthorized'});
  next();
}

app.get('/api/health', (req, res) => res.json({ok:true}));

// list managed bot containers
app.get('/api/bots', checkAuth, async (req, res) => {
  try {
    const containers = await docker.listContainers({all:true, filters: {label:['managed_by=vps-host']}});
    return res.json(containers.map(c => ({id:c.Id, names:c.Names, image:c.Image, state:c.State, status:c.Status, labels:c.Labels})));
  } catch (err) {
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

// create a new bot container
app.post('/api/bots', checkAuth, async (req, res) => {
  try {
    const {name, language, token} = req.body;
    if (!name || !language) return res.status(400).json({error:'missing name or language'});
    if (!token) return res.status(400).json({error:'missing bot token (DISCORD token)'});

    const image = language === 'python' ? 'vps_python_template:latest' : 'vps_node_template:latest';
    const containerName = `bot_${name.replace(/[^a-zA-Z0-9_-]/g,'_')}_${Date.now()}`;
    const env = [
      `DISCORD_TOKEN=${token}`,
      `BOT_NAME=${name}`,
      `OWNER_EMAIL=${OWNER_EMAIL}`
    ];

    const container = await docker.createContainer({
      Image: image,
      name: containerName,
      Env: env,
      Labels: {managed_by: 'vps-host', owner_email: OWNER_EMAIL, bot_name: name},
      HostConfig: {
        RestartPolicy: { Name: 'always' },
        Memory: 512 * 1024 * 1024
      }
    });
    await container.start();
    return res.json({ok:true, id: container.id, name: containerName});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

app.post('/api/bots/:id/start', checkAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const container = docker.getContainer(id);
    await container.start();
    res.json({ok:true});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

app.post('/api/bots/:id/stop', checkAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const container = docker.getContainer(id);
    await container.stop();
    res.json({ok:true});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

app.delete('/api/bots/:id', checkAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const container = docker.getContainer(id);
    await container.remove({force:true});
    res.json({ok:true});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

// Create HTTP server and attach WebSocket server for logs
const http = require('http');
const server = http.createServer(app);
const { WebSocketServer } = require('ws');
const { Writable } = require('stream');

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // simple token auth via query string: /ws?token=...
  const qs = req.url.split('?')[1] || '';
  const params = new URLSearchParams(qs);
  const token = params.get('token');
  if (!token || token !== ADMIN_TOKEN) {
    ws.send(JSON.stringify({ error: 'unauthorized' }));
    ws.close();
    return;
  }

  const activeStreams = new Map();

  ws.on('message', async (message) => {
    let msg;
    try { msg = JSON.parse(message.toString()); } catch (e) { return; }
    if (msg.type === 'logs' && msg.containerId) {
      try {
        const container = docker.getContainer(msg.containerId);
        const logStream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 200 });

        const writer = new Writable({
          write(chunk, encoding, callback) {
            try { ws.send(chunk.toString()); } catch (e) { /* ignore */ }
            callback();
          }
        });

        // demux stdout/stderr into the single writer so client gets plain text
        docker.modem.demuxStream(logStream, writer, writer);

        activeStreams.set(msg.containerId, { logStream, writer });

        logStream.on('end', () => {
          try { writer.end(); } catch (e) {}
          activeStreams.delete(msg.containerId);
        });

      } catch (err) {
        ws.send(JSON.stringify({ error: err.message }));
      }
    } else if (msg.type === 'stopLogs' && msg.containerId) {
      const entry = activeStreams.get(msg.containerId);
      if (entry) {
        try { entry.logStream.destroy(); } catch (e) {}
        activeStreams.delete(msg.containerId);
        ws.send(JSON.stringify({ ok: true, stopped: msg.containerId }));
      }
    }
  });

  ws.on('close', () => {
    // cleanup active streams
    for (const [id, entry] of activeStreams.entries()) {
      try { entry.logStream.destroy(); } catch (e) {}
    }
    activeStreams.clear();
  });
});

server.listen(PORT, () => console.log(`API + WS listening on ${PORT}`));
