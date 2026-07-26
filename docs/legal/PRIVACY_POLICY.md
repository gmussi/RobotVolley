# Privacy Policy — Robot Volley

**Effective date:** July 26, 2026  
**Publisher:** G. P. S. MUSSI LTDA  
**Contact:** contact@guilhermemussi.com

This Privacy Policy explains how **Robot Volley** (“the Game”, “we”, “us”) handles
information when you play the browser version, the desktop (Steam) version, or use
online multiplayer.

We do **not** require an account to play. We do **not** sell your personal data.

---

## 1. Summary

| Activity                      | Data involved                          | Stored by us?                               |
| ----------------------------- | -------------------------------------- | ------------------------------------------- |
| Playing offline / local modes | Settings on your device                | No server storage                           |
| Online matchmaking            | Approximate location, session ID       | In memory only, deleted when you disconnect |
| Online gameplay               | IP addresses, game inputs (via WebRTC) | Peer-to-peer; not stored on our servers     |
| Steam (desktop)               | Achievements, optional cloud save      | Valve (Steam), not our servers              |

---

## 2. Information stored on your device

The Game saves preferences locally so your settings persist between sessions:

- Audio volume levels
- Control bindings and accessibility options (colorblind mode, reduced motion)
- Unlocked achievement progress (also synced to Steam on the desktop build when available)

**Where it is stored**

- **Web / browser:** your browser’s `localStorage` on your device.
- **Desktop (Steam):** a JSON save file in the app’s user data folder. When Steam
  Cloud is enabled for the Game, Valve may sync this file across your Steam devices.

We do not receive this data unless you contact us for support and choose to share it.

---

## 3. Online multiplayer

When you choose **Online Match**, the Game connects to services so you can find an
opponent and play in real time.

### 3.1 Matchmaking server

We operate a matchmaking service hosted on **Cloudflare Workers**. When you connect:

- Cloudflare derives **approximate geographic information** from your connection
  (country, nearest data center, and coarse latitude/longitude). We use this only
  to pair you with a nearby opponent.
- The server assigns a **random session player ID** (UUID). It exists only while
  your connection is open.
- The server **relays WebRTC signaling messages** (connection offers, answers, and
  ICE candidates) between you and your matched opponent so a direct connection can
  be established.

**We do not** log chat, gameplay, or signaling content to disk. Session data lives
in server memory and is **deleted when you disconnect** or the session ends.

### 3.2 Peer-to-peer gameplay (WebRTC)

Once matched, gameplay data (inputs, game state snapshots) is sent **directly between
players** over encrypted WebRTC data channels.

During connection setup, **IP addresses and network information** may be exchanged
between players (and with relay infrastructure below). This is required for real-time
multiplayer and is standard for WebRTC games.

We do **not** record or store the contents of your matches on our servers.

### 3.3 NAT traversal (STUN / TURN)

To connect players behind firewalls or strict networks, the Game may use:

- **Google public STUN** (`stun.l.google.com`) — helps discover network paths. Google
  operates this service; their privacy practices apply to that traffic.
- **Optional TURN relay** (e.g. Metered.ca, when configured in the build) — if a direct
  peer connection fails, game packets may route through a third-party relay. The relay
  provider may process IP addresses and traffic metadata according to its own policy.

---

## 4. Steam (desktop version)

If you launch the Game through the **Steam client**:

- **Valve Corporation** processes your Steam account data under the
  [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/) and
  [Steam Privacy Policy](https://store.steampowered.com/privacy_agreement/).
- The Game may read your **Steam display name and Steam ID** locally to confirm Steam
  is running and to unlock **achievements**. This information is **not sent to our
  matchmaking servers**.
- **Steam Cloud** (if enabled) syncs your local save file via Valve’s infrastructure.

---

## 5. Web version hosting

The browser build is hosted on **GitHub Pages**. GitHub may collect standard web server
logs (IP address, browser type, request time) as described in
[GitHub’s Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

---

## 6. What we do not collect

We do **not** intentionally collect:

- Real names, email addresses, or phone numbers through the Game itself
- Payment information (Steam handles purchases)
- Precise GPS location
- Analytics or advertising identifiers
- Voice chat or user-generated text content (the Game has no chat)

---

## 7. Children

The Game is a general-audience arcade sports title. We do not knowingly collect personal
information from children. If you believe a child has provided us personal information,
contact us at contact@guilhermemussi.com and we will delete it.

---

## 8. Your rights (including LGPD)

If you are in **Brazil** or another jurisdiction with data-protection laws, you may
have the right to:

- Confirm whether we hold personal data about you
- Request access, correction, or deletion
- Object to or restrict certain processing
- Withdraw consent where processing is consent-based

Because online sessions are ephemeral and not stored, we typically cannot retrieve a
past matchmaking session after it ends. Contact **contact@guilhermemussi.com** with your request;
we will respond within a reasonable time as required by applicable law.

---

## 9. Data retention

| Data                | Retention                                 |
| ------------------- | ----------------------------------------- |
| Local save file     | Until you delete it or uninstall the Game |
| Matchmaking session | Until disconnect (in-memory only)         |
| WebRTC gameplay     | Not retained by us                        |
| Support emails      | As long as needed to resolve your request |

---

## 10. Security

We use industry-standard practices for our matchmaking service (encrypted WebSocket,
minimal data collection). No online transmission is 100% secure; play online at your
own discretion.

---

## 11. Changes

We may update this policy. The “Effective date” at the top will change. Continued use
of the Game after an update means you accept the revised policy.

---

## 12. Contact

**G. P. S. MUSSI LTDA**  
Email: contact@guilhermemussi.com  
Country: Brazil

For Steam-specific data practices, contact Valve directly.
