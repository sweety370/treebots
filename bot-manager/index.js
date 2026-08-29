const express = require("express");
const mineflayer = require("mineflayer");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_MANAGER_SECRET =
  process.env.BOT_MANAGER_SECRET || "";

const bots = new Map();

function auth(req, res, next) {
  if (!BOT_MANAGER_SECRET) {
    return next();
  }

  const provided =
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";

  if (provided !== BOT_MANAGER_SECRET) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

function getBot(id) {
  return bots.get(id);
}

function serializeBot(id, botData) {
  return {
    id,
    status: botData.status,
    username: botData.bot?.username || botData.username,
    host: botData.host,
    port: botData.port,
    version: botData.version,
    ping: botData.bot?.player
      ? botData.bot.player.ping
      : null,
    uptime:
      botData.startedAt && botData.status === "online"
        ? Date.now() - botData.startedAt
        : 0,
    error: botData.error || null
  };
}

async function startBot(config) {
  const {
    id,
    username,
    host,
    port = 25565,
    version
  } = config;

  if (!id || !username || !host) {
    throw new Error(
      "id, username and host are required"
    );
  }

  const existing = bots.get(id);

  if (existing?.status === "online") {
    return serializeBot(id, existing);
  }

  const botData = {
    id,
    username,
    host,
    port: Number(port),
    version,
    bot: null,
    status: "connecting",
    startedAt: null,
    error: null
  };

  bots.set(id, botData);

  const bot = mineflayer.createBot({
    host,
    port: Number(port),
    username,
    version: version || false
  });

  botData.bot = bot;

  bot.once("spawn", () => {
    botData.status = "online";
    botData.startedAt = Date.now();
    botData.error = null;
    console.log(`[${id}] Bot online`);
  });

  bot.on("error", (err) => {
    botData.status = "error";
    botData.error = err.message;
    console.error(`[${id}]`, err.message);
  });

  bot.on("end", () => {
    botData.status = "offline";
    botData.startedAt = null;
    console.log(`[${id}] Bot disconnected`);
  });

  bot.on("kicked", (reason) => {
    botData.status = "offline";
    botData.startedAt = null;
    botData.error = String(reason);
    console.log(`[${id}] Kicked:`, reason);
  });

  return serializeBot(id, botData);
}

function stopBot(id) {
  const botData = getBot(id);

  if (!botData) {
    throw new Error("Bot not found");
  }

  if (botData.bot) {
    botData.bot.quit("Stopped by TreeBots");
  }

  botData.status = "offline";
  botData.startedAt = null;

  return serializeBot(id, botData);
}

function restartBot(config) {
  const existing = getBot(config.id);

  if (existing?.bot) {
    try {
      existing.bot.quit("Restarting");
    } catch {}
  }

  bots.delete(config.id);

  return startBot(config);
}

app.get("/", (req, res) => {
  res.json({
    service: "TreeBots Bot Manager",
    status: "online",
    bots: bots.size
  });
});

app.get("/status", auth, (req, res) => {
  res.json({
    status: "online",
    bots: [...bots.entries()].map(
      ([id, botData]) =>
        serializeBot(id, botData)
    )
  });
});

app.post("/start", auth, async (req, res) => {
  try {
    const result = await startBot(req.body);

    res.json({
      success: true,
      bot: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/stop", auth, (req, res) => {
  try {
    const result = stopBot(req.body.id);

    res.json({
      success: true,
      bot: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/restart", auth, async (req, res) => {
  try {
    const result = await restartBot(req.body);

    res.json({
      success: true,
      bot: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/bot/:id", auth, (req, res) => {
  const botData = getBot(req.params.id);

  if (!botData) {
    return res.status(404).json({
      error: "Bot not found"
    });
  }

  res.json(
    serializeBot(
      req.params.id,
      botData
    )
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `TreeBots Bot Manager listening on port ${PORT}`
  );
});
