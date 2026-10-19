# Wall kiosk browser policies

Chromium on the kitchen wall Pi reads managed policies from
`/etc/chromium/policies/managed/`. Two are ours:

- `symphony-wall-local-network.json` — lets the wall page reach the
  home-energy bridge on the Pi (`LocalNetworkAccessAllowedForUrls`).
- `symphony-wall-autoplay.json` (this folder) — lets the wall page play sound
  without a tap first, so a timer alarm still rings after the page reloads
  itself for a new build. Sound goes to the default PipeWire sink, the EMEET
  OfficeCore M0 Plus.

Install, then restart the kiosk browser (or reboot) to load it:

```
scp infra/wall-kiosk/symphony-wall-autoplay.json pi@symphony-wall.local:/tmp/
ssh pi@symphony-wall.local 'sudo install -m 644 /tmp/symphony-wall-autoplay.json /etc/chromium/policies/managed/'
```

Check it at `chrome://policy` on the Pi (or over the remote-debugging port).
