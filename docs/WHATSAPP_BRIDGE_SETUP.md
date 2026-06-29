# WhatsApp Bridge Setup

The WhatsApp widget needs a local bridge because WhatsApp does not provide a free official group-chat API for this use case.

This bridge uses WhatsApp Web via Baileys. It is unofficial, so keep it private, use it gently, and make sure your group knows a bridge/bot can read the chat.

## Start The Bridge

```bash
npm run whatsapp:bridge
```

The bridge starts on:

```text
http://127.0.0.1:3333
```

The first run prints a QR code in the terminal.

On your phone:

```text
WhatsApp -> Linked devices -> Link a device
```

Scan the QR. The bridge stores its local session in `.whatsapp-auth/`, which is ignored by git.

## Find Your Group ID

After the bridge says it is connected, open this URL in a browser:

```text
http://127.0.0.1:3333/groups
```

Or through AVN Hub's proxy:

```text
http://127.0.0.1:3000/api/whatsapp?bridgeUrl=http://127.0.0.1:3333&mode=groups
```

Find the group you want. Copy its `id`; it should look like:

```text
120363XXXXXXXXXXXX@g.us
```

## Configure The Widget

Open the WhatsApp widget settings in AVN Hub:

```text
bridge url: http://127.0.0.1:3333
group id:   120363XXXXXXXXXXXX@g.us
```

If AVN Hub runs in Docker but the bridge runs on your Windows host, use:

```text
bridge url: http://host.docker.internal:3333
```

If the bridge runs on another machine, use that machine's LAN or Tailscale URL:

```text
bridge url: http://192.168.1.50:3333
```

## Endpoints

The bridge exposes:

```text
GET  /health
GET  /groups
GET  /messages?groupId=<group jid>&limit=20
POST /send
```

`POST /send` body:

```json
{
  "groupId": "120363XXXXXXXXXXXX@g.us",
  "message": "hello from AVN Hub"
}
```

## Stop The Bridge

If the bridge is running in your current terminal, press `Ctrl+C`.

If it is running in the background:

```bash
npm run stop:whatsapp
```

To stop AVN Hub, NutBot local LLM services, and the WhatsApp bridge:

```bash
npm run stop:all
```

## Notes

- Messages are kept in bridge memory while it runs. It will show new messages after it connects; deep historical backfill is not guaranteed.
- If WhatsApp logs out, stop the bridge, delete `.whatsapp-auth/`, restart, and scan the QR again.
- Keep auto-reply behavior off unless everyone in the group has agreed to it.
