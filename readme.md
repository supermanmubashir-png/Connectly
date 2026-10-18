# Connectly v1.0 — Connect. Chat. Share.

A small installable PWA for one-to-one chat and file transfer. You pair with a contact **once**; after that Connectly reconnects to them automatically.

## Required files (exactly four)

| File | Purpose |
|---|---|
| `index.html` | All HTML, CSS and JavaScript |
| `manifest.json` | PWA metadata (icon is an inline SVG data URI, so no fifth file) |
| `sw.js` | Versioned app-shell cache and offline fallback |
| `readme.md` | This document |

## Run locally

```
python -m http.server 1879
```

Open `http://localhost:1879`. This server only serves static files. It provides no signaling, no message delivery and no file storage. Use `localhost` in development and HTTPS when hosted (WebRTC, Web Crypto and service workers need a secure context).

## Signaling provider: PeerJS Cloud

Connectly uses the free public **PeerJS Cloud** signaling server (`0.peerjs.com`) through the PeerJS client library.

What I checked in PeerJS's published documentation:

- The client connects to the free PeerJS Cloud by default; no registration or API key is needed for the default server.
- PeerJS lets you choose your own peer ID, which Connectly uses as the stable contact identifier.
- The PeerJS maintainers announced that **free TURN is discontinued**; the public signaling server itself stays operational. Their older docs still mention a free TURN, which is outdated.
- The library is loaded from jsDelivr, pinned to `peerjs@1.5.5`. The `<script>` tag has no Subresource Integrity hash because I did not compute one; add one before production use.

Limits and caveats:

- The public server is a shared best-effort service with no published SLA or documented rate limits. Treat it as prototype-grade. For anything serious, run your own PeerServer (`npm install peer`, or the `peerjs/peerjs-server` Docker image) and point `new Peer(...)` in `index.html` to it with `host`, `port`, `path` and `secure`.
- The signaling server has no authentication. Anyone can register an ID that is currently unused. Connectly therefore never trusts an ID alone (see Security).
- No account setup is required, and no private keys exist in the code.

## Pairing (once per contact)

1. Chats → **+** → **Create invitation**. Send the code (`cly1-…`) through any channel. It is single-use, expires after 15 minutes, and the inviter must keep Connectly open.
2. The other person opens **+**, pastes the code and taps **Join**.
3. Both screens show a **security code**. Compare them out of band (call, in person) and confirm. They match only if both sides derived the same secret.
4. The contact (ID plus a shared secret) is saved in IndexedDB.

## Automatic reconnection

- On start, when the network returns, and when the tab becomes visible again, Connectly reconnects to every saved contact through the signaling service. No codes are exchanged again.
- Every reconnect is verified with an HMAC proof derived from the secret exchanged at pairing. A connection that fails verification is closed.
- Retries use exponential backoff with jitter (about 1.5 s, 3 s, 6 s … up to 60 s) and stop after 6 attempts, showing **Connection failed**. They pause while the tab is hidden. The **Reconnect** button in a chat retries the saved connection; it never asks for a new invitation.
- States shown: Connecting, Online, Reconnecting, Offline, Connection failed.
- If both devices connect at once, the connection started by the lexicographically lower ID wins, so the pair does not close each other.
- Leaving to UtiliX closes live connections; they resume when you come back.

## Messaging and delivery wording

Messages use a small versioned JSON protocol (`v:1`) with unique IDs and validation. Statuses: **Saved locally · not sent**, **Sent · not yet confirmed** (written to an open data channel), **Confirmed by recipient** (the other Connectly sent an acknowledgement), **Failed to send**.

## Offline behavior

There is no offline delivery. Without a server-side mailbox, a message can only reach a contact who is online. Messages written while a contact is offline stay on your device as "Saved locally" and are re-sent automatically on the next connection (the receiver ignores duplicates). History is local to each browser and is not synchronized between your devices. **My Devices** is a local notes chat only.

## File transfer

- Chunked binary transfer (64 KB chunks) over the data channel with sequence numbers, `bufferedAmount` backpressure, an outgoing queue of up to 20 files, progress, speed, cancel, and a final acknowledgement from the receiver.
- Default size limit is 200 MB, configurable in Settings (1–2000 MB). The receiver enforces its own limit.
- Received files are assembled in memory before being saved, so very large files can fail on low-memory phones.
- An interrupted transfer is marked **Failed** and is **not resumed**; send it again.
- Received files are never opened or run. Only PNG/JPEG/GIF/WebP are previewed; everything else is a download. Object URLs are revoked when switching chats.
- Retention of files in IndexedDB is optional in Settings.

## Backup

Settings → Export backup writes contacts, messages, preferences and device identity as JSON (files are not included). The backup contains contact secrets, so keep it private. Restore validates the structure first, asks for confirmation and only adds missing items. Restoring the identity on a second device while the first is still in use will cause an ID conflict.

## Security considerations

- Chats and files travel directly between devices over WebRTC and are encrypted in transit (DTLS). The signaling service sees device IDs and connection metadata (such as IP addresses), not message contents.
- STUN only reveals your public address and relays nothing. Some networks (symmetric NAT, corporate or school firewalls, some mobile carriers) need a **TURN relay**, which may carry encrypted traffic. Connectly includes none, so on those networks connections can fail.
- This is not a complete verified-identity E2EE messenger. Your protection is the security-code comparison at pairing plus the per-contact secret checked on every reconnect. If that comparison is skipped, a man-in-the-middle at pairing is possible.
- All incoming messages, signaling payloads and files are treated as untrusted and validated. The UI is built with DOM text nodes (no `innerHTML` on received data, no `eval`). Message contents are not logged.
- The service worker caches only the app shell and the pinned PeerJS script, never chats, invitations, signaling or files.

## Deploy on GitHub Pages

1. Put the four files at the root of a repository (or a folder served by Pages).
2. Settings → Pages → deploy from the branch.
3. Open the HTTPS URL on both devices and install it from the browser menu.
4. When shipping a new version, change `VERSION` in `sw.js`; users get an "Update" prompt.

## Testing status (important)

**None of the following has been run by me.** I only checked that the JavaScript parses (`node --check`). The code has not been run in a browser and no real two-device connection has been made, so do not assume any of it works until you have tested it. Please test each item with two independent browser profiles or two real devices:

1. First-time pairing and security-code confirmation
2. Contact saved; close and reopen; automatic reconnection with no new code
3. Messages in both directions; status transitions to "Confirmed by recipient"
4. File send and receive (small, large, several at once); cancel
5. Connection loss and recovery; offline contact shown correctly
6. Local history after restart
7. Backup export and restore
8. UtiliX link and return
9. Theme switching
10. Offline app-shell load
11. Invalid or expired invitation
12. Signaling failure (block `0.peerjs.com`)
13. Restricted network or failed ICE
14. File transfer interrupted mid-way
15. Storage-quota errors

Known unverified areas: installability with an SVG data-URI icon on every browser (some may prefer PNG 192/512), and behavior of PeerJS's binary serialization with the chunk size used here.
