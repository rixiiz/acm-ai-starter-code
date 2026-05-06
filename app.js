const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const state = {
  hasApiKey: false,
  model: "gemini-2.5-flash",
  messages: [],
  isSending: false,
};

const setupPanel = document.querySelector("#setupPanel");
const chatPanel = document.querySelector("#chatPanel");
const keyForm = document.querySelector("#keyForm");
const chatForm = document.querySelector("#chatForm");
const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const modelStatus = document.querySelector("#modelStatus");
const toggleKeyButton = document.querySelector("#toggleKey");
const loadModelsButton = document.querySelector("#loadModels");
const previewChatButton = document.querySelector("#previewChat");
const changeKeyButton = document.querySelector("#changeKey");
const clearChatButton = document.querySelector("#clearChat");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#sendButton");
const messagesEl = document.querySelector("#messages");

populateModelOptions(DEFAULT_MODELS);
clearBackendSession();

keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = apiKeyInput.value.trim();
  const model = modelInput.value.trim();

  if (!key || !model) return;

  state.model = model;
  await saveApiKey(key);
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();

  if (!text || state.isSending) return;

  promptInput.value = "";
  resizePrompt();
  appendMessage("user", text);
  state.messages.push({ role: "user", content: text });
  await sendToGemini();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

promptInput.addEventListener("input", resizePrompt);

toggleKeyButton.addEventListener("click", () => {
  const shouldShow = apiKeyInput.type === "password";
  apiKeyInput.type = shouldShow ? "text" : "password";
  toggleKeyButton.textContent = shouldShow ? "Hide" : "Show";
  toggleKeyButton.setAttribute("aria-label", shouldShow ? "Hide API key" : "Show API key");
});

loadModelsButton.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    setModelStatus("Enter an API key first, then load models.", true);
    apiKeyInput.focus();
    return;
  }

  await loadAvailableModels(key);
});

previewChatButton.addEventListener("click", () => {
  state.hasApiKey = false;
  state.model = modelInput.value.trim() || state.model;
  state.messages = [
    {
      role: "user",
      content: "Can you help me plan a simple study schedule for this week?",
    },
    {
      role: "model",
      content:
        "Yes. Start by choosing three study blocks, one review block, and one short practice session. Keep each block focused on a single topic.",
    },
  ];

  renderMessages();
  setupPanel.classList.add("hidden");
  chatPanel.classList.remove("hidden");
  promptInput.focus();
});

changeKeyButton.addEventListener("click", () => {
  chatPanel.classList.add("hidden");
  setupPanel.classList.remove("hidden");
  apiKeyInput.focus();
});

clearChatButton.addEventListener("click", () => {
  state.messages = [];
  messagesEl.innerHTML = "";
  appendMessage("model", "Chat cleared. Send a message to begin again.");
  promptInput.focus();
});

async function sendToGemini() {
  if (!state.hasApiKey) {
    appendMessage("model", "Preview mode only. Add a Gemini API key before sending real messages.", true);
    return;
  }

  setSending(true);
  const loadingMessage = appendMessage("model", "Thinking...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: state.model,
        messages: state.messages,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed with status ${response.status}`);
    }

    const answer = extractOutputText(data);
    state.messages.push({ role: "model", content: answer });
    updateMessage(loadingMessage, answer);
  } catch (error) {
    updateMessage(
      loadingMessage,
      error.message || "Something went wrong while contacting the Gemini API.",
      true,
    );
  } finally {
    setSending(false);
  }
}

async function loadAvailableModels(apiKey) {
  loadModelsButton.disabled = true;
  setModelStatus("Loading models for this API key...");

  try {
    const response = await fetch("/api/models", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed with status ${response.status}`);
    }

    const models = (data.data || [])
      .concat(data.models || [])
      .filter((model) => canGenerateContent(model))
      .map((model) => model.name || model.id || "")
      .map((name) => name.replace(/^models\//, ""))
      .filter(isGeminiModel)
      .sort((a, b) => a.localeCompare(b));

    if (!models.length) {
      throw new Error("No Gemini models were found for this key.");
    }

    populateModelOptions(models);

    if (!models.includes(modelInput.value.trim())) {
      modelInput.value = models[0];
    }

    setModelStatus(`Loaded ${models.length} available Gemini models.`);
  } catch (error) {
    populateModelOptions(DEFAULT_MODELS);
    setModelStatus(error.message || "Could not load models. Showing common models.", true);
  } finally {
    loadModelsButton.disabled = false;
  }
}

async function saveApiKey(apiKey) {
  const submitButton = keyForm.querySelector(".primary-button");
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    state.hasApiKey = true;
    apiKeyInput.value = "";
    setupPanel.classList.add("hidden");
    chatPanel.classList.remove("hidden");
    promptInput.focus();
  } catch (error) {
    setModelStatus(error.message || "Could not save the Gemini API key.", true);
  } finally {
    submitButton.disabled = false;
  }
}

async function clearBackendSession() {
  try {
    await fetch("/api/session", { method: "DELETE" });
  } catch {
    // If the backend is unavailable, the first chat call will surface the error.
  }

  state.hasApiKey = false;
}

function populateModelOptions(models) {
  const previous = modelInput.value || "gemini-2.5-flash";
  modelInput.innerHTML = "";

  const unique = [...new Set(models)];
  for (const model of unique) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelInput.append(option);
  }

  if (unique.includes(previous)) {
    modelInput.value = previous;
  } else if (unique.length) {
    modelInput.value = unique[0];
  }
}

function isGeminiModel(modelId) {
  return modelId.startsWith("gemini-");
}

function canGenerateContent(model) {
  if (!Array.isArray(model.supportedGenerationMethods)) {
    return true;
  }

  return model.supportedGenerationMethods.includes("generateContent");
}

function setModelStatus(message, isError = false) {
  modelStatus.textContent = message;
  modelStatus.classList.toggle("error-text", isError);
}

function extractOutputText(response) {
  const chunks = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean) || [];

  return chunks.join("\n").trim() || "The model returned no text.";
}

function appendMessage(role, text, isError = false) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.classList.toggle("error", isError);
  bubble.textContent = text;

  article.append(avatar, bubble);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function renderMessages() {
  messagesEl.innerHTML = "";
  for (const message of state.messages) {
    appendMessage(message.role, message.content);
  }
}

function updateMessage(bubble, text, isError = false) {
  bubble.textContent = text;
  bubble.classList.toggle("error", isError);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setSending(isSending) {
  state.isSending = isSending;
  sendButton.disabled = isSending;
  promptInput.disabled = isSending;
}

function resizePrompt() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${promptInput.scrollHeight}px`;
}
