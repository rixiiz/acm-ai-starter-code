const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const SESSION_COOKIE = "gemini_chat_session";
const sessions = new Map();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Chatbot running at http://${HOST}:${PORT}`);
});

async function handleApi(request, response) {
  if (request.method === "GET" && request.url === "/api/session") {
    const session = getSession(request);
    sendJson(response, 200, { hasKey: Boolean(session?.apiKey) });
    return;
  }

  if (request.method === "POST" && request.url === "/api/session") {
    const body = await readJson(request);
    const apiKey = String(body.apiKey || "").trim();

    if (!apiKey) {
      sendJson(response, 400, { error: "Gemini API key is required." });
      return;
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    sessions.set(sessionId, {
      apiKey,
      createdAt: Date.now(),
    });

    const cookieParts = [
      `${SESSION_COOKIE}=${sessionId}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
    ];

    response.setHeader("Set-Cookie", cookieParts.join("; "));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/session") {
    const sessionId = getSessionId(request);
    if (sessionId) {
      sessions.delete(sessionId);
    }

    response.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/api/models") {
    const body = await readJson(request);
    const apiKey = String(body.apiKey || "").trim() || getSession(request)?.apiKey;

    if (!apiKey) {
      sendJson(response, 401, { error: "Enter a Gemini API key first." });
      return;
    }

    const geminiResponse = await fetch(`${GEMINI_API_BASE_URL}/models`, {
      headers: {
        "x-goog-api-key": apiKey,
      },
    });
    const data = await geminiResponse.json().catch(() => ({}));
    sendJson(response, geminiResponse.status, data);
    return;
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    const session = getSession(request);

    if (!session?.apiKey) {
      sendJson(response, 401, { error: "Add a Gemini API key before sending real messages." });
      return;
    }

    const body = await readJson(request);
    const model = String(body.model || "").trim();

    if (!model.startsWith("gemini-")) {
      sendJson(response, 400, { error: "Choose a Gemini model." });
      return;
    }

    const geminiResponse = await fetch(
      `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": session.apiKey,
        },
        body: JSON.stringify({
          contents: (body.messages || []).map((message) => ({
            role: message.role === "model" ? "model" : "user",
            parts: [{ text: String(message.content || "") }],
          })),
        }),
      },
    );
    const data = await geminiResponse.json().catch(() => ({}));
    sendJson(response, geminiResponse.status, data);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, normalizedPath);

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

function getSession(request) {
  const sessionId = getSessionId(request);
  return sessionId ? sessions.get(sessionId) : null;
}

function getSessionId(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[SESSION_COOKIE] || "";
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      cookies[name] = valueParts.join("=");
    }
    return cookies;
  }, {});
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}
