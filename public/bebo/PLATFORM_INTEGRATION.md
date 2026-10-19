# Bebo platform integration

The browser build uses the authenticated platform API at `/api/help-assistant`.
Guest users can play Bebo's local motions; questions and generated speech require
a signed-in Waseet user. No Gemini key or Waseet service credential belongs in this UI.

On the platform origin, the widget uses the same `waseet_token` and `waseet_user`
session as Angular. For another approved application host, configure the existing
user session from the host's authentication layer:

```js
document.querySelector('bebo-chat').configureSession({
  token: userAccessToken,
  apiBase: 'https://your-platform-backend.example/api/help-assistant',
  userId: currentUser.id,
  role: currentUser.activeRole
});
```

The token remains in memory and is never written by Bebo to storage. Call
`configureSession(null)` on sign-out; host session changes must also update the
widget. Automatic Waseet session checks stop pending requests and clear displayed
conversation/audio on logout or account/role changes. Cross-origin backend use
requires its normal CORS configuration. An arbitrary `api-base` HTML attribute
cannot receive the user's JWT; a host-approved API base is required.

Requests use `GET /capabilities`, `POST /chat`, and `POST /tts`. The chat endpoint
accepts a maximum 500-character question and bounded history, and returns
`{success:true,data:{reply,citations,dialect}}`. Text renders as escaped Markdown;
the compact bubble is a prose preview with a link to full details. Speech uses
plain-text chunks and can be stopped. Voices and TTS models come from server
capabilities. Conversation history is bounded and saved per user/role in the
current browser tab; clear and JSON export are available in the history panel.

This local build has been verified with mocked browser/backend behavior. It has
not been published or tested against a paid model provider.
