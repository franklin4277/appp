# MT5 Auto Journal Bridge

This bridge runs on your trading machine and sends MT5 trades to your journal API.

It captures screenshots automatically:
- Entry screenshot when a new position opens
- Exit screenshot when a position closes

Manual journaling still works in the app. This bridge only adds auto-sync.

## 1) Install dependencies

```powershell
pip install MetaTrader5 requests mss
```

## 2) Generate bridge key in app

In **Settings -> MT5 Auto Journal Bridge**:
1. Click `Enable bridge` (or `Rotate bridge key`).
2. Copy the generated key (shown once).
3. Copy the bridge endpoint URL.

## 3) Configure environment variables

Example PowerShell session:

```powershell
$env:MT5_BRIDGE_API_URL="https://your-backend.onrender.com"
$env:MT5_BRIDGE_API_KEY="tj_mt5_XXXXXXXXXXXXXXXX"
$env:MT5_BRIDGE_PROFILE_ID="main"
$env:MT5_BRIDGE_SETUP_TYPE="Asia Break -> Continuation"
$env:MT5_BRIDGE_POLL_SECONDS="2"
$env:MT5_BRIDGE_SOURCE="mt5"
$env:MT5_BRIDGE_NAME="mt5"
$env:MT5_BRIDGE_REQUIRE_HMAC="true"
$env:MT5_BRIDGE_ASIA_HL_USED="true"
$env:MT5_BRIDGE_POC_INTERACTION="true"
$env:MT5_BRIDGE_POC_OUTCOME="Acceptance"
$env:MT5_BRIDGE_CLEAN_SETUP="true"
```

Optional:

```powershell
$env:MT5_TERMINAL_PATH="C:\Program Files\MetaTrader 5\terminal64.exe"
$env:MT5_LOGIN="12345678"
$env:MT5_PASSWORD="your_password"
$env:MT5_SERVER="Broker-Server"
$env:MT5_BRIDGE_RECORDING_URL_TEMPLATE="https://storage.example.com/mt5/{ticket}.mp4"
$env:MT5_BRIDGE_RECORDING_DURATION_SECONDS="12"
```

## 4) Run bridge

```powershell
python .\scripts\mt5-bridge\mt5_auto_journal_bridge.py
```

## Notes

- Browser apps cannot directly capture MT5 terminal screenshots. The bridge handles capture locally and uploads to API.
- Requests are signed using `x-bridge-ts`, `x-bridge-nonce`, and `x-bridge-signature` when `MT5_BRIDGE_REQUIRE_HMAC=true`.
- If you already run your own recorder (OBS, etc.), use `MT5_BRIDGE_RECORDING_URL_TEMPLATE` to attach a video URL per trade.
- If the bridge restarts, it resumes from `mt5_bridge_state.json`.
