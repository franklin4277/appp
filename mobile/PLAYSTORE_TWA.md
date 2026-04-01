# Journex - Play Store (TWA) Guide

This project is a web app (PWA). To publish on Google Play, wrap it as an Android app using a Trusted Web Activity (TWA).

## 1) Prerequisites

- A live HTTPS URL for your app (for example your Render frontend domain)
- Node.js installed
- Java JDK 17+
- Android SDK command-line tools (or Android Studio)
- Google Play Console account

## 1.5) App Icon / Branding (Important)

The Android app icon used by the TWA wrapper is taken from your deployed PWA manifest icons.

In this repo, the PWA/TWA icons are generated from `client/public/favicon.svg` and written to:

- `client/public/pwa-192x192.png`
- `client/public/pwa-512x512.png`
- `client/public/apple-touch-icon.png`

To regenerate icons after changing the logo:

```powershell
cd client
npm.cmd run generate:icons
```

Then rebuild + redeploy the frontend so your manifest at `https://YOUR_DOMAIN/manifest.webmanifest` is updated.

## 2) Install Bubblewrap

```powershell
npm.cmd i -g @bubblewrap/cli
bubblewrap --version
```

## 3) Initialize Android wrapper project

Use your deployed manifest URL:

```powershell
mkdir mobile\twa
cd mobile\twa
bubblewrap init --manifest https://YOUR_DOMAIN/manifest.webmanifest
```

Bubblewrap will ask for:
- Android package id (example: `com.tradecircle.tradingjournal`)
- App name (`Journex`)
- Signing key setup

## 4) Build Android App Bundle (AAB)

```powershell
cd mobile\twa
bubblewrap build
```

If you already created a TWA project before updating the manifest/icons, run:

```powershell
cd mobile\\twa
bubblewrap update
bubblewrap build
```

Output AAB/APK files are generated in the TWA project output folders.

## 5) Add Digital Asset Links

Your web app already includes:

- `client/public/.well-known/assetlinks.json`

Update this file with:
- The exact Android package id
- SHA256 certificate fingerprint(s)

You can generate it quickly with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-assetlinks.ps1 `
  -PackageName "com.tradecircle.tradingjournal" `
  -Fingerprints "AA:BB:CC:...,11:22:33:..."
```

Deploy frontend after updating `assetlinks.json` so it is reachable at:

`https://YOUR_DOMAIN/.well-known/assetlinks.json`

## 6) Upload to Play Console

1. Create app in Play Console
2. Go to `Test and release > Testing > Internal testing`
3. Create release and upload the generated `.aab`
4. Add testers and verify install
5. Move to production when ready

Note: New apps on Play are expected to use Android App Bundles (`.aab`).

## 7) Verification checklist

- App opens full-screen without browser URL bar
- `https://YOUR_DOMAIN/.well-known/assetlinks.json` is accessible
- Package name in Play build matches `assetlinks.json`
- SHA256 fingerprint in `assetlinks.json` matches signing cert
