# ACM AI Starter Code

A small chatbot UI with a Node backend that stores the user's Gemini API key in
a server-side session and proxies requests to the Gemini API.

## Get a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in
   with a Google account.
2. Click **Create API key**. If prompted, pick (or create) a Google Cloud
   project to attach the key to.
3. Copy the key — it starts with `AIza...`. Paste it into the setup screen
   when you start the app.

The free tier is enough for casual development. The key is sent to the local
backend once and held in an in-memory session; the browser only keeps an
HttpOnly session cookie.

## Run it

```bash
npm start
```

Then visit `http://localhost:8000`.

## Notes

- The setup screen includes a searchable Gemini model field. It starts with
  common Gemini models, and "Load models" fetches every Gemini model available
  to the entered API key.
- The API key is sent to the backend once and kept in an in-memory server
  session. The browser only receives an HttpOnly session cookie.
- The app clears that session when the setup page loads, so users must enter
  their API key each time. Any key prefill is handled by the browser's normal
  password/autofill behavior, not by this app.
