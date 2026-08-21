# Scanner-side commands used around the BT module OTA

The app talks to the RE4000 scanner over its own BLE bridge (separate from the
Feasycom SDK connection). These are the scanner-side commands involved in a BT
module update. They are included here so the full end-to-end sequence is clear —
they are handled by the scanner's application firmware, not by the BT module.

## Transport

```
Service:   0000FFF0-0000-1000-8000-00805f9b34fb
Write:     0000FFF2-0000-1000-8000-00805f9b34fb  (WRITE_NO_RESPONSE)
Notify:    0000FFF1-0000-1000-8000-00805f9b34fb
```

Text commands are Base64-encoded before writing, with `=` padding replaced by
`*`. The scanner replies with plain UTF-8 text on the notify characteristic.

## Commands

### `fw1036` — release the BT module for OTA

- Sent right before the app disconnects and hands the module to the Feasycom
  SDK for OTA.
- ACK: `fw1036:ack`
- Only sent to new-protocol scanner firmware (2.0+). Older firmware must NOT
  receive it — it keeps the original disconnect-only flow.

### `exec: BTRESTREBOOT` — finalize after a successful OTA

- Serial command execution: the scanner runs the given serial command.
  - ACK: `exec: cmd_ok`
  - nACK: `exec: cmd_not_found`
- `BTRESTREBOOT` fully resets the BT module to factory settings. It is
  REQUIRED after a BT module firmware update. Side effects:
  - Wipes the scanner's BT pairings (user must re-pair headsets etc.).
  - The module reboots immediately, dropping the BLE link — often BEFORE the
    ACK is delivered. A dropped link right after sending is the success
    signature; only an explicit `cmd_not_found`, or silence with the link
    still up, means failure.
- `exec:` commands require scanner application firmware **2.0+**. Older
  firmware answers nothing at all (no `cmd_not_found`), which is why the app
  gates BT module updates on scanner firmware ≥ 2.0.

## End-to-end sequence

```
App                       Scanner (FFF0 link)             BT module (Feasycom SDK)
 |  fw1036  ───────────────►  releases BT module
 |  ◄─────────  fw1036:ack
 |  disconnect FFF0 link
 |                                                        scan → match address/UUID
 |                                                        startOta(.dfu) — XMODEM
 |                                                        ... progress 0→100% ...
 |                                                        module reboots (silent disconnect)
 |  reconnect FFF0 link (retry up to 60 s)
 |  exec: BTRESTREBOOT  ───►  factory-resets module
 |  (link drops — expected)   module reboots
```
