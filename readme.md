# SyncBee v1.5 — Connect. Chat. Share.

A small installable PWA for one-to-one chat and file transfer. You pair with a contact **once**; after that SyncBee reconnects to them automatically.

## Files

| File | Purpose |
|---|---|
| `index.html` | Splash screen: green dots form `icon.png`, then redirects to `home.html` after 3 seconds (tap to skip). Shows "Powered by UtiliX". |
| `home.html` | The SyncBee app (all HTML, CSS and JavaScript) |
| `manifest.json` | PWA metadata; the icon is `icon.png` |
| `sw.js` | Versioned app-shell cache and offline fallback |
| `help.html` | Plain-language user guide opened by the "New to SyncBee?" button |
| `readme.md` | This document |
| `icon.png` | **You create this.** A square PNG, 512×512 recommended (at least 192×192), transparent background works best for the dot animation. If it is missing the splash falls back to a ring of dots and the browser shows no custom icon. |

Local run: `python -m http.server 1879`, then open `http://localhost:1879` (the splash appears first). That server only serves static files. It provides no signaling, no message delivery and no file storage. Use `localhost` in development and HTTPS when hosted.

## Signaling provider: PeerJS Cloud

SyncBee uses the free public **PeerJS Cloud** signaling server (`0.peerjs.com`) through the PeerJS client library.

What I checked in PeerJS's published documentation:

- The client connects to the free PeerJS Cloud by default; no registration or API key is needed for the default server.
- PeerJS lets you choose your own peer ID, which SyncBee uses as the stable contact identifier.
- The PeerJS maintainers announced that **free TURN is discontinued**; the public signaling server itself stays operational. Their older docs still mention a free TURN, which is outdated.
- The library is loaded from jsDelivr, pinned to `peerjs@1.5.5`. The `<script>` tag has no Subresource Integrity hash because I did not compute one; add one before production use.

Limits and caveats:

- The public server is a shared best-effort service with no published SLA or documented rate limits. Treat it as prototype-grade. For anything serious, run your own PeerServer (`npm install peer`, or the `peerjs/peerjs-server` Docker image) and point `new Peer(...)` in `index.html` to it with `host`, `port`, `path` and `secure`.
- The signaling server has no authentication. Anyone can register an ID that is currently unused. SyncBee therefore never trusts an ID alone (see Security).
- No account setup is required, and no private keys exist in the code.

## Pairing (once per contact)

1. Chats → **+** → **Create invitation**. Send the code (`cly1-…`) through any channel. It is single-use, expires after 15 minutes, and the inviter must keep SyncBee open.
2. The other person opens **+**, pastes the code and taps **Join**.
3. Both screens show a **security code**. Compare them out of band (call, in person) and confirm. They match only if both sides derived the same secret.
4. The contact (ID plus a shared secret) is saved in IndexedDB.

## Automatic reconnection

- On start, when the network returns, and when the tab becomes visible again, SyncBee reconnects to every saved contact through the signaling service. No codes are exchanged again.
- Every reconnect is verified with an HMAC proof derived from the secret exchanged at pairing. A connection that fails verification is closed.
- Retries use exponential backoff with jitter (about 1.5 s, 3 s, 6 s … up to 60 s) and stop after 6 attempts, showing **Connection failed**. They pause while the tab is hidden. The **Reconnect** button in a chat retries the saved connection; it never asks for a new invitation.
- States shown: Connecting, Online, Reconnecting, Offline, Connection failed.
- If both devices connect at once, the connection started by the lexicographically lower ID wins, so the pair does not close each other.
- Leaving to UtiliX closes live connections; they resume when you come back.

## Messaging and delivery wording

Messages use a small versioned JSON protocol (`v:1`) with unique IDs and validation. Statuses: **Saved locally · not sent**, **Sent · not yet confirmed** (written to an open data channel), **Confirmed by recipient** (the other SyncBee sent an acknowledgement), **Failed to send**.

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
- STUN only reveals your public address and relays nothing. Some networks (symmetric NAT, corporate or school firewalls, some mobile carriers) need a **TURN relay**, which may carry encrypted traffic. SyncBee includes none, so on those networks connections can fail.
- This is not a complete verified-identity E2EE messenger. Your protection is the security-code comparison at pairing plus the per-contact secret checked on every reconnect. If that comparison is skipped, a man-in-the-middle at pairing is possible.
- All incoming messages, signaling payloads and files are treated as untrusted and validated. The UI is built with DOM text nodes (no `innerHTML` on received data, no `eval`). Message contents are not logged.
- The service worker caches only the app shell and the pinned PeerJS script, never chats, invitations, signaling or files.

## Deploy on GitHub Pages

1. Put all six files (including `icon.png`) at the root of a repository (or a folder served by Pages).
2. Settings → Pages → deploy from the branch.
3. Open the HTTPS URL on both devices and install it from the browser menu.
4. When shipping a new version, change `VERSION` in `sw.js`; users get an "Update" prompt.

## Features added in v1.1

- **Floating pill navigation** (Chats, UtiliX, Settings). It hides inside an open chat on phones to leave room for the composer.
- **Status** (Chats → Status tab): text or photo updates that last 24 hours, a viewer with auto-advance, "viewed by" for your own statuses, mute a contact's status, and **Status privacy** (all contacts / all except / only selected). Statuses are peer-to-peer: a contact receives one only while you are both online, and on each reconnect SyncBee re-syncs what they are allowed to see (removed or expired statuses are pruned). A status deleted while a contact is offline disappears for them at the next sync or after 24 hours.
- **Profile**: photo, name and about, shared with contacts when connected. The photo can be hidden in Privacy settings. Contacts keep their own local nickname for you.
- **Messaging**: reply with quotes, emoji reactions, edit, delete for me / delete for everyone (needs the contact to be online), star and a starred list, emoji picker, typing indicator, read receipts (both sides can switch them off; they also govern status views), pin / mute / archive chats, chat filters (All, Unread, Online, Archived), and per-contact disappearing messages (24 hours or 7 days).
- **Settings**: accent colours, text size, chat wallpaper, Enter-key behavior, notification toggle, status privacy, TURN relay entry, diagnostics log.

Limits: edits, deletions and reactions are applied only when the contact is online at that moment. Notifications are local only (no push service): they appear while SyncBee is still running and never contain message text. Disappearing messages are a convenience, not a guarantee, because a modified client can ignore them. There are no voice notes, group chats, calls, or app lock in this version.

## Features added in v1.3

- **Splash and icon**: `index.html` animates hundreds of green dots into `icon.png`, then opens `home.html`. The icon is also used for the favicon, home-screen icon and manifest. Replace the file and bump `VERSION` in `sw.js` to refresh the cache.
- **Navigation**: Chats, Posts, UtiliX, Settings in a floating pill bar, centred on desktop as well as on phones.
- **Posts**: a feed of text and photo posts from you and your contacts. Posts have no expiry, can be liked, and are deleted only by you. They travel peer-to-peer like statuses: a contact receives a post only while you are both online and allowed in Posts privacy, and everything is re-synced on reconnect. Likes from a contact who is offline when they tap the heart are sent at the next connection.
- **Status**: lasts 24 hours by default (6 or 12 hours in Settings) and can be shown to all contacts or specific ones. "Visible to everyone" here means all contacts: there is no server, so a stranger can see a status only through your public status link while your app is online.
- **Stickers and GIFs** (😊 panel in a chat): stickers are generated or imported on your device (a few starters are drawn on first use) and sent as small images. GIFs come from a library you build from GIF files and are sent as normal file transfers. Online GIF search is not included because the GIF services require an API key that cannot be hidden in a static app.
- **Voice notes**: tap the mic, speak, tap again to send; needs microphone permission and a connected contact. Received voice notes get an audio player.
- **More WhatsApp-style**: block / unblock, clear chat, large emoji for emoji-only messages, sticker size, sort chats, date separators, unread count in the page title, blur images until tapped, confirm before sending files, notification text preview toggle, data saver, blur on background, posts privacy and likes, plus the existing reply, react, edit, forward, broadcast, pin, mute, archive and disappearing messages.

Limits: no groups, calls or push delivery. Everything that depends on a contact needs both devices online at the same time.

## Features added in v1.4

- **Renamed to SyncBee.** Internal identifiers (database name, device ID prefix) are unchanged so existing chats and pairings keep working.
- **Help button**: a pill under the connection status opens `help.html`.
- **Last seen and online** with a privacy switch (turning it off hides other people's last seen from you too).
- **Username** (`@name`) next to the Device ID. It is a handle shown to contacts; without a server it cannot be reserved or searched globally.
- **Drag and drop** files onto a chat on desktop; file size, transferred amount, speed, time left and status are shown on every transfer.
- **QR code pairing**: invitations show a QR code that opens SyncBee and fills the invite; in-app scanning uses the browser's BarcodeDetector where available (Chrome/Android), otherwise scan with the phone camera app.
- **Favorites and custom tabs** in the chat list (＋ chip), search by `@username`.
- **Dropdown menus** for chat and message actions, link cards above links, image/audio previews above file details.
- **Notification sounds**: six built-in tones, a separate group tone, volume, and your own sound file.
- **Settings in vertical tabs** (Account, General, Chats, Notifications, Privacy, Status and posts, Media and storage, Connection, Help and about), plus new options: last seen, auto-download by type, high contrast, bold text, keep screen on, backup reminders, delete account on this device and more.
- **Groups, communities and the default group** (see below).

### Groups, communities and the default group

- The creator of a group is its **host**. The host's device is the group's mailbox: it stores messages and passes them to members when they connect, so a message from someone who has since gone offline still reaches the others, as long as the host's device is online. If the host is offline, new messages wait on the sender's device and go out when the host returns. There is no server.
- A **community** is an announcement group (only hosts post) that lists groups members can join. Groups and communities are joined with an invitation code or QR (valid 7 days, many people).
- **Default group "MirCodeStudio Team"**: its admin and host is the device with Device ID `cly-3vc4rypnk5662cpvjitr` (set in `TEAM.host` near the group code in `home.html`; `TEAM.admins` can list more admin IDs). Every new account joins automatically and cannot leave. It starts as **admins-only** (members read, admins send); an admin can switch that off in Group settings. That device must keep SyncBee open for the group to work. Anyone who knows the host's ID can join, so treat the group as public.
- **Admins and group settings**: the creator is the admin (host). The host can make other members admins. Only admins can change group settings: name, description, only admins can send messages, only admins can invite people, how much history new members see, and disappearing messages. Changes by admins are sent to the host device, which checks the sender and applies them; requests from non-admins are ignored.
- Files, reactions, edits and delete-for-everyone are not available inside groups yet.

### Not available (and why)

- **Posts and status are delivered through a relay.** The default group's admin device doubles as a relay: when you post or update a status while it is online, it keeps a copy (up to 10 statuses and 20 posts per person) and hands it to the contacts you allow when they connect, even if you are offline by then. Limits: it works only while the relay device is online; the relay can read what passes through it (items are not end-to-end encrypted or signed); the recipient must be your contact; if you remove someone from your audience while they are offline, their copy is not recalled; likes and "viewed by" need you to be online. Switch it off in Settings, Status and posts, Offline delivery.
- **Signing in on several devices at once with one username.** One device ID can be online on only one device, and a username directory needs a server.

## Testing status (important)

**None of the following has been run by me.** I checked that the JavaScript parses (`node --check`) and ran the local, non-network features (profile, status, reply, star, edit, settings) once in a simulated browser (jsdom with a fake IndexedDB). Group, admin-settings, host-mailbox, relay, invite and pairing logic was exercised in a simulated network with three in-memory app instances (36 checks, 6 consecutive passing runs); no real WebRTC, file transfer, voice recording, canvas-drawn stickers, QR camera scanning, drag and drop, sounds or the splash animation has been exercised. The code has not been run in a browser and no real two-device connection has been made, so do not assume any of it works until you have tested it. Please test each item with two independent browser profiles or two real devices:

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
