#!/usr/bin/env python3
"""
MT5 -> Trading Journal auto-sync bridge.

What it does:
- Detects new MT5 positions (entry) and captures a screenshot.
- Detects closed positions (exit), captures another screenshot, then syncs trade data
  and screenshots to /api/trades/bridge/mt5.
- Keeps a local state file so restarts do not duplicate sync.

Dependencies:
  pip install MetaTrader5 requests mss
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import requests

try:
    import MetaTrader5 as mt5
except ImportError as exc:
    raise SystemExit("Missing dependency: MetaTrader5. Run `pip install MetaTrader5`.") from exc

try:
    import mss
    import mss.tools
except ImportError as exc:
    raise SystemExit("Missing dependency: mss. Run `pip install mss`.") from exc


@dataclass
class BridgeConfig:
    api_url: str
    api_key: str
    profile_id: str
    setup_type: str
    poll_seconds: float
    request_timeout_seconds: float
    state_file: Path
    post_entry_event: bool
    source_name: str
    bridge_name: str
    account_id: str
    screen_recording_url_template: str
    recording_duration_seconds: int
    require_hmac: bool
    asia_hl_used: bool
    poc_interaction: bool
    poc_outcome: str
    clean_setup: bool


def env_bool(name: str, default: bool) -> bool:
    value = str(os.getenv(name, str(default))).strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


def load_config() -> BridgeConfig:
    api_url = str(os.getenv("MT5_BRIDGE_API_URL", "")).strip().rstrip("/")
    api_key = str(os.getenv("MT5_BRIDGE_API_KEY", "")).strip()
    if not api_url or not api_key:
        raise SystemExit("Set MT5_BRIDGE_API_URL and MT5_BRIDGE_API_KEY first.")

    state_path = Path(str(os.getenv("MT5_BRIDGE_STATE_FILE", "./mt5_bridge_state.json")).strip())

    return BridgeConfig(
        api_url=api_url,
        api_key=api_key,
        profile_id=str(os.getenv("MT5_BRIDGE_PROFILE_ID", "main")).strip(),
        setup_type=str(os.getenv("MT5_BRIDGE_SETUP_TYPE", "Asia Break -> Continuation")).strip(),
        poll_seconds=max(0.7, float(os.getenv("MT5_BRIDGE_POLL_SECONDS", "2.0"))),
        request_timeout_seconds=max(
            5.0, float(os.getenv("MT5_BRIDGE_REQUEST_TIMEOUT_SECONDS", "18.0"))
        ),
        state_file=state_path,
        post_entry_event=env_bool("MT5_BRIDGE_POST_ENTRY_EVENT", True),
        source_name=str(os.getenv("MT5_BRIDGE_SOURCE", "mt5")).strip().lower() or "mt5",
        bridge_name=str(os.getenv("MT5_BRIDGE_NAME", "mt5")).strip().lower() or "mt5",
        account_id=str(os.getenv("MT5_BRIDGE_ACCOUNT_ID", "")).strip(),
        screen_recording_url_template=str(os.getenv("MT5_BRIDGE_RECORDING_URL_TEMPLATE", "")).strip(),
        recording_duration_seconds=max(
            0, min(int(float(os.getenv("MT5_BRIDGE_RECORDING_DURATION_SECONDS", "12"))), 20)
        ),
        require_hmac=env_bool("MT5_BRIDGE_REQUIRE_HMAC", True),
        asia_hl_used=env_bool("MT5_BRIDGE_ASIA_HL_USED", True),
        poc_interaction=env_bool("MT5_BRIDGE_POC_INTERACTION", True),
        poc_outcome=str(os.getenv("MT5_BRIDGE_POC_OUTCOME", "Acceptance")).strip(),
        clean_setup=env_bool("MT5_BRIDGE_CLEAN_SETUP", True),
    )


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"open_positions": {}, "updated_at": now_utc_iso()}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw.setdefault("open_positions", {})
            return raw
    except Exception:
        pass
    return {"open_positions": {}, "updated_at": now_utc_iso()}


def save_state(path: Path, state: Dict[str, Any]) -> None:
    state["updated_at"] = now_utc_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def infer_session(dt: datetime) -> str:
    hour = dt.hour
    if hour < 7:
        return "Asia"
    if hour < 13:
        return "London"
    return "New York"


def to_trade_type(mt5_type: int) -> str:
    if mt5_type == mt5.POSITION_TYPE_BUY:
        return "Buy"
    if mt5_type == mt5.POSITION_TYPE_SELL:
        return "Sell"
    return "Buy"


def calculate_planned_rr(entry: float, stop_loss: float, take_profit: float) -> float:
    risk = abs(entry - stop_loss)
    reward = abs(take_profit - entry)
    if risk <= 0:
        return 0.0
    return reward / risk


def infer_result(trade_type: str, entry: float, exit_price: float) -> str:
    if trade_type == "Buy":
        if exit_price > entry:
            return "Win"
        if exit_price < entry:
            return "Loss"
        return "BE"
    if trade_type == "Sell":
        if exit_price < entry:
            return "Win"
        if exit_price > entry:
            return "Loss"
        return "BE"
    return "BE"


def result_to_rr(result: str, planned_rr: float) -> float:
    if result == "Win":
        return planned_rr
    if result == "Loss":
        return -1.0
    return 0.0


def iso_from_epoch_seconds(epoch_seconds: float) -> str:
    dt = datetime.fromtimestamp(float(epoch_seconds), tz=timezone.utc)
    return dt.replace(microsecond=0).isoformat()


def capture_fullscreen_data_url() -> str:
    with mss.mss() as capture:
        monitor = capture.monitors[1] if len(capture.monitors) > 1 else capture.monitors[0]
        shot = capture.grab(monitor)
        png_bytes = mss.tools.to_png(shot.rgb, shot.size)
    encoded = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_recording_url(config: BridgeConfig, ticket: str) -> str:
    template = config.screen_recording_url_template
    if not template:
        return ""
    return template.replace("{ticket}", ticket)


def post_bridge_payload(config: BridgeConfig, payload: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = f"{config.api_url}/api/trades/bridge/mt5"
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    headers = {
        "Content-Type": "application/json",
        "x-integration-key": config.api_key,
    }
    if config.require_hmac:
        timestamp = str(int(time.time()))
        nonce = secrets.token_hex(16)
        message = f"{timestamp}.{nonce}.{raw_body}".encode("utf-8")
        signature = hmac.new(
            config.api_key.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()
        headers["x-bridge-ts"] = timestamp
        headers["x-bridge-nonce"] = nonce
        headers["x-bridge-signature"] = f"sha256={signature}"

    response = requests.post(
        endpoint,
        headers=headers,
        data=raw_body.encode("utf-8"),
        timeout=config.request_timeout_seconds,
    )
    if response.status_code >= 300:
        body = response.text[:700]
        raise RuntimeError(f"Bridge sync failed ({response.status_code}): {body}")
    return response.json()


def build_strategy_tags(config: BridgeConfig) -> Dict[str, Any]:
    return {
        "asiaHighLowUsed": config.asia_hl_used,
        "pocInteraction": config.poc_interaction,
        "pocOutcome": config.poc_outcome,
        "cleanSetup": config.clean_setup,
    }


def snapshot_open_position(position: Any) -> Dict[str, Any]:
    entry_dt = datetime.fromtimestamp(float(position.time), tz=timezone.utc)
    return {
        "ticket": str(position.ticket),
        "symbol": str(position.symbol),
        "entryPrice": float(position.price_open),
        "stopLoss": float(position.sl),
        "takeProfit": float(position.tp),
        "volume": float(position.volume),
        "tradeType": to_trade_type(int(position.type)),
        "tradeDate": entry_dt.replace(microsecond=0).isoformat(),
        "session": infer_session(entry_dt),
    }


def fetch_exit_snapshot(ticket: str) -> Optional[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=10)
    try:
        deals = mt5.history_deals_get(start, now, position=int(ticket))
    except Exception:
        deals = None
    if not deals:
        return None

    exit_deals = [deal for deal in deals if getattr(deal, "entry", None) == mt5.DEAL_ENTRY_OUT]
    target = exit_deals[-1] if exit_deals else deals[-1]
    exit_time_seconds = float(getattr(target, "time", time.time()) or time.time())
    return {
        "price": float(getattr(target, "price", 0.0) or 0.0),
        "time": iso_from_epoch_seconds(exit_time_seconds),
    }


def build_payload(
    config: BridgeConfig,
    open_trade: Dict[str, Any],
    event_type: str,
    before_shot: str,
    after_shot: str,
    result: str,
    rr_achieved: float,
    recording_url: str,
) -> Dict[str, Any]:
    return {
        "bridge": config.bridge_name,
        "source": config.source_name,
        "eventType": event_type,
        "profileId": config.profile_id,
        "externalTradeId": open_trade["ticket"],
        "screenRecordingUrl": recording_url,
        "mt5": {
            "accountId": config.account_id,
            "positionId": open_trade["ticket"],
            "symbol": open_trade["symbol"],
        },
        "trade": {
            "pair": open_trade["symbol"],
            "tradeDate": open_trade["tradeDate"],
            "session": open_trade["session"],
            "tradeType": open_trade["tradeType"],
            "setupType": config.setup_type,
            "entryPrice": open_trade["entryPrice"],
            "stopLoss": open_trade["stopLoss"],
            "takeProfit": open_trade["takeProfit"],
            "lotSize": open_trade["volume"],
            "riskPercent": 1,
            "result": result,
            "rrAchieved": round(rr_achieved, 4),
            "recordingDurationSeconds": config.recording_duration_seconds,
        },
        "tags": build_strategy_tags(config),
        "notes": {
            "priceAction": "",
            "executionReview": "Auto-synced from MT5 bridge.",
            "emotionalState": "",
        },
        "screenshots": {
            "beforeBase64": before_shot,
            "afterBase64": after_shot,
            "beforeNote": "Auto-captured at entry.",
            "afterNote": "Auto-captured at exit.",
        },
    }


def process_entries(config: BridgeConfig, state: Dict[str, Any], open_positions: Dict[str, Any]) -> None:
    for ticket, position in open_positions.items():
        if ticket in state["open_positions"]:
            continue

        trade = snapshot_open_position(position)
        trade["beforeScreenshot"] = capture_fullscreen_data_url()
        trade["entrySynced"] = False
        state["open_positions"][ticket] = trade

        if not config.post_entry_event:
            continue

        planned_rr = calculate_planned_rr(trade["entryPrice"], trade["stopLoss"], trade["takeProfit"])
        payload = build_payload(
            config=config,
            open_trade=trade,
            event_type="entry",
            before_shot=trade["beforeScreenshot"],
            after_shot="",
            result="BE",
            rr_achieved=result_to_rr("BE", planned_rr),
            recording_url=build_recording_url(config, ticket),
        )
        try:
            post_bridge_payload(config, payload)
            trade["entrySynced"] = True
            print(f"[ENTRY] synced ticket={ticket} {trade['symbol']}")
        except Exception as exc:
            trade["entryError"] = str(exc)
            print(f"[ENTRY] sync failed ticket={ticket}: {exc}")


def process_exits(config: BridgeConfig, state: Dict[str, Any], open_positions: Dict[str, Any]) -> None:
    known_tickets = list(state["open_positions"].keys())
    for ticket in known_tickets:
        if ticket in open_positions:
            continue

        trade = state["open_positions"].get(ticket)
        if not trade:
            continue

        exit_snapshot = fetch_exit_snapshot(ticket)
        if exit_snapshot is None:
            # Keep in state and retry later until MT5 history shows the close deal.
            continue
        exit_price = float(exit_snapshot["price"])

        planned_rr = calculate_planned_rr(
            float(trade["entryPrice"]), float(trade["stopLoss"]), float(trade["takeProfit"])
        )
        result = infer_result(trade["tradeType"], float(trade["entryPrice"]), float(exit_price))
        rr_achieved = result_to_rr(result, planned_rr)
        after_shot = capture_fullscreen_data_url()

        payload = build_payload(
            config=config,
            open_trade=trade,
            event_type="exit",
            before_shot=str(trade.get("beforeScreenshot") or ""),
            after_shot=after_shot,
            result=result,
            rr_achieved=rr_achieved,
            recording_url=build_recording_url(config, ticket),
        )
        payload["trade"]["exitPrice"] = float(exit_price)
        payload["trade"]["exitTime"] = str(exit_snapshot["time"])

        try:
            post_bridge_payload(config, payload)
            print(
                f"[EXIT] synced ticket={ticket} {trade['symbol']} result={result} rr={round(rr_achieved, 3)}"
            )
            state["open_positions"].pop(ticket, None)
        except Exception as exc:
            trade["exitError"] = str(exc)
            trade["lastExitAttemptAt"] = now_utc_iso()
            state["open_positions"][ticket] = trade
            print(f"[EXIT] sync failed ticket={ticket}: {exc}")


def main() -> None:
    config = load_config()
    state = ensure_state(config.state_file)

    terminal = str(os.getenv("MT5_TERMINAL_PATH", "")).strip()
    if terminal:
        initialized = mt5.initialize(path=terminal)
    else:
        initialized = mt5.initialize()

    if not initialized:
        raise SystemExit(f"Could not initialize MetaTrader5: {mt5.last_error()}")

    login = str(os.getenv("MT5_LOGIN", "")).strip()
    server = str(os.getenv("MT5_SERVER", "")).strip()
    password = str(os.getenv("MT5_PASSWORD", "")).strip()
    if login and password and server:
        authorized = mt5.login(int(login), password=password, server=server)
        if not authorized:
            raise SystemExit(f"MT5 login failed: {mt5.last_error()}")

    account = mt5.account_info()
    if account and not config.account_id:
        config.account_id = str(getattr(account, "login", "") or "")

    print("MT5 bridge started.")
    print(f"Endpoint: {config.api_url}/api/trades/bridge/mt5")
    print(f"Profile: {config.profile_id} | Setup: {config.setup_type}")

    try:
        while True:
            positions = mt5.positions_get()
            if positions is None:
                print(f"[WARN] positions_get returned None: {mt5.last_error()}")
                time.sleep(config.poll_seconds)
                continue

            open_positions = {str(position.ticket): position for position in positions}
            process_entries(config, state, open_positions)
            process_exits(config, state, open_positions)
            save_state(config.state_file, state)
            time.sleep(config.poll_seconds)
    except KeyboardInterrupt:
        print("\nStopping MT5 bridge...")
    finally:
        save_state(config.state_file, state)
        mt5.shutdown()


if __name__ == "__main__":
    main()
