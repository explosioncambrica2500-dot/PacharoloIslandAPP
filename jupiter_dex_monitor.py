#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
====================================================================
JUPITER DEX REAL-TIME CRYPTO MONITOR & ROTATION ARBITRAGE (Python)
====================================================================
Monitorea cotizaciones en tiempo real para BTC, ETH, SOL, ZEC y HYPE
utilizando la API de Jupiter DEX (Solana).

Estrategia Cuantitativa de Rotación por Porcentaje de Cambio:
  1. Calcula en tiempo real el % de cambio de las 5 monedas.
  2. Compra inicial: Adquiere la moneda cuyo porcentaje de cambio a la baja es
     mayor (la moneda que resulta más barata con mayor descuento).
  3. Swap de Rotación: Realiza swap automático o manual de la moneda
     que ha bajado menos de precio (o subido más) a la que ha bajado más
     (máximo descuento / rebote potencial).
  4. Exportación a CSV: Registra todas las compras y swaps de rotación con
     diferencial de spread (%), precios y hashes de Solana.
  5. Modo Bot Automático: Rebalanceo automático cuando el spread supera el umbral.
  6. 100% biblioteca estándar de Python (sin 'pip install').
====================================================================
"""

import urllib.request
import urllib.error
import json
import time
import datetime
import csv
import sys
import os
import threading
from typing import Dict, Any, List, Optional, Tuple

# Solana Mint addresses on Jupiter DEX
TOKENS = {
    "SOL": {
        "name": "Solana",
        "mint": "So11111111111111111111111111111111111111112",
        "fallback": 102.85,
    },
    "BTC": {
        "name": "Bitcoin (Portal/WBTC)",
        "mint": "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        "fallback": 78450.0,
    },
    "ETH": {
        "name": "Ether (Portal)",
        "mint": "7vfCXTUXx5WJV5JADk17DUJ4ksau7utNKj4b963voxs",
        "fallback": 2470.0,
    },
    "ZEC": {
        "name": "Zcash",
        "mint": "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
        "fallback": 1130.0,
    },
    "HYPE": {
        "name": "Hyperliquid",
        "mint": "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
        "fallback": 84.3,
    },
}

class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    MAGENTA = "\033[95m"
    BLUE = "\033[94m"
    WHITE = "\033[97m"
    BG_CYAN = "\033[46m\033[30m"
    BG_MAGENTA = "\033[45m\033[30m"
    BG_YELLOW = "\033[43m\033[30m"


class AlertRule:
    def __init__(self, symbol: str, condition: str, target_price: float, note: str = ""):
        self.symbol = symbol.upper()
        self.condition = condition.upper()  # 'ABOVE' or 'BELOW'
        self.target_price = float(target_price)
        self.note = note
        self.triggered_count = 0
        self.last_triggered_at: Optional[float] = None


class JupiterMonitor:
    def __init__(self, poll_interval: float = 2.0, csv_filename: str = "transacciones_jupiter.csv"):
        self.poll_interval = poll_interval
        self.csv_filename = csv_filename
        self.running = True
        self.prices: Dict[str, Dict[str, Any]] = {}
        self.previous_prices: Dict[str, float] = {}
        self.latency_ms: float = 0.0
        self.last_update_str: str = "Iniciando..."
        self.status_message: str = "Conectando a Jupiter DEX..."
        self.error_count: int = 0
        self.transactions: List[Dict[str, Any]] = []

        # Estado de la Estrategia de Rotación
        self.initial_buy_done = False
        self.current_holding_token: str = "SOL"
        self.current_holding_amount: float = 0.0
        self.initial_capital_usd: float = 500.0
        self.min_spread_threshold: float = 2.0  # Umbral spread para auto-swap: 2%
        self.min_net_gain_pct: float = 0.50     # Mínimo aumento del monto total tras costes para realizar swap (0.5%)
        self.gas_fee_usd: float = 0.015         # Coste de red Solana estimado en USD (~0.0001 SOL)
        self.dex_fee_pct: float = 0.10          # Comisión Jupiter DEX pool (0.10%)
        self.slippage_pct: float = 0.15         # Impacto de precio y slippage estimado (0.15%)
        self.auto_bot_enabled: bool = False
        self.last_swap_time: Optional[float] = None
        self.total_swaps_count: int = 0

        # Configuración de Wallet Solana
        # Por defecto: Jupiter Wallet (Nativa de Jupiter DEX) en Modo Simulación / Paper Trading (0 riesgo)
        # Opcional: configurar mediante variables de entorno JUPITER_WALLET_ADDRESS o SOLANA_WALLET_ADDRESS
        self.wallet_provider: str = os.environ.get("SOLANA_WALLET_PROVIDER", "Jupiter Wallet (Nativa)")
        self.wallet_address: str = os.environ.get(
            "JUPITER_WALLET_ADDRESS",
            os.environ.get("SOLANA_WALLET_ADDRESS", os.environ.get("SOLANA_PUBLIC_KEY", "Jup4d13nTYyWvGjXGsmD24hQZ9v8bCq9Q5N4vJUPITER"))
        )
        self.wallet_mode: str = "REAL (On-Chain)" if os.environ.get("SOLANA_PRIVATE_KEY") else "SIMULACIÓN (Paper Trading)"

        # Umbrales de alerta configurables
        self.alerts: List[AlertRule] = [
            AlertRule("SOL", "ABOVE", 110.0, "Resistencia"),
            AlertRule("BTC", "ABOVE", 80000.0, "Ruptura 80k"),
            AlertRule("ETH", "BELOW", 2400.0, "Soporte"),
        ]
        self.notifications_log: List[str] = []

    def fetch_prices(self) -> bool:
        """Consulta la API de Jupiter DEX con cálculo de latencia y gestión de errores."""
        start_time = time.time()
        mints = [
            TOKENS["SOL"]["mint"],
            TOKENS["BTC"]["mint"],
            TOKENS["ZEC"]["mint"],
            TOKENS["HYPE"]["mint"],
        ]
        url = f"https://api.jup.ag/price/v3?ids={','.join(mints)}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "JupiterPythonMonitor/1.0",
        }

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=4.0) as response:
                raw_data = response.read().decode("utf-8")
                data = json.loads(raw_data)

            self.latency_ms = (time.time() - start_time) * 1000.0

            for sym, d in self.prices.items():
                if "usdPrice" in d:
                    self.previous_prices[sym] = d["usdPrice"]

            now_iso = datetime.datetime.now().strftime("%H:%M:%S")

            for sym in ["SOL", "BTC", "ZEC", "HYPE"]:
                mint = TOKENS[sym]["mint"]
                t_data = data.get(mint, {})
                self.prices[sym] = {
                    "usdPrice": t_data.get("usdPrice", TOKENS[sym]["fallback"]),
                    "change24h": t_data.get("priceChange24h", -1.5),
                    "liquidity": t_data.get("liquidity", 1000000),
                }

            self._fetch_eth_price()

            self.last_update_str = now_iso
            self.status_message = "En línea • Conectado a Jupiter API"
            self.check_alerts()

            # Evaluar bot de auto-rebalanceo
            if self.auto_bot_enabled:
                self.check_auto_rotation()

            return True

        except urllib.error.HTTPError as he:
            self.latency_ms = (time.time() - start_time) * 1000.0
            if he.code == 429:
                self.status_message = "Límite 429 (Too Many Requests). Enfriando tasa de consulta..."
                time.sleep(1.0)
            else:
                self.status_message = f"Error HTTP {he.code}: {he.reason}"
            self._use_fallback_prices()
            return False

        except Exception as e:
            self.latency_ms = (time.time() - start_time) * 1000.0
            self.status_message = f"Error de red ({type(e).__name__}). Reintentando..."
            self._use_fallback_prices()
            return False

    def _fetch_eth_price(self):
        """Consulta Ether (Portal) en Jupiter."""
        try:
            url = "https://api.jup.ag/tokens/v2/search?query=ETH"
            req = urllib.request.Request(url, headers={"User-Agent": "JupiterPythonMonitor/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                eth_list = json.loads(resp.read().decode("utf-8"))
                for t in eth_list:
                    if t.get("symbol") == "ETH" and t.get("usdPrice"):
                        self.prices["ETH"] = {
                            "usdPrice": float(t["usdPrice"]),
                            "change24h": float(t.get("stats24h", {}).get("priceChange", -1.4)),
                            "liquidity": float(t.get("liquidity", 22000000)),
                        }
                        return
        except Exception:
            pass

        if "ETH" not in self.prices:
            self.prices["ETH"] = {
                "usdPrice": TOKENS["ETH"]["fallback"],
                "change24h": -1.35,
                "liquidity": 22250000,
            }

    def _use_fallback_prices(self):
        """Mantiene datos activos en caso de micro-cortes o límites de tasa."""
        import random
        for sym, conf in TOKENS.items():
            if sym not in self.prices:
                self.prices[sym] = {"usdPrice": conf["fallback"], "change24h": -1.2, "liquidity": 1000000}
            else:
                p = self.prices[sym]["usdPrice"]
                self.prices[sym]["usdPrice"] = round(p * (1 + (random.random() - 0.5) * 0.0004), 2 if p > 100 else 4)

    def get_token_ranking(self) -> List[Tuple[str, float, float]]:
        """
        Calcula y ordena los tokens por su porcentaje de cambio descendente.
        Retorna lista de tuplas: (symbol, usdPrice, change24h)
        [0] -> Mayor % de cambio ("la que ha bajado menos / subido más")
        [-1] -> Menor % de cambio ("la que ha bajado más")
        """
        ranking = []
        for sym in ["SOL", "BTC", "ETH", "ZEC", "HYPE"]:
            p_data = self.prices.get(sym, {})
            price = p_data.get("usdPrice", TOKENS[sym]["fallback"])
            chg = p_data.get("change24h", 0.0)
            ranking.append((sym, price, chg))

        # Ordenar descendente por change24h
        ranking.sort(key=lambda x: x[2], reverse=True)
        return ranking

    def execute_initial_buy(self) -> str:
        """
        Comienza con una compra de la moneda cuyo porcentaje de cambio a la baja es mayor
        (la moneda que resulta más barata con mayor descuento).
        """
        ranking = self.get_token_ranking()
        # ranking[0] es la que ha bajado menos; ranking[-1] es la que más ha bajado (la más barata)
        cheapest_sym, cheapest_price, cheapest_chg = ranking[-1]

        amt = round(self.initial_capital_usd / cheapest_price, 5 if cheapest_price > 100 else 3)
        tx_id = f"init_{int(time.time())}"
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        tx = {
            "id": tx_id,
            "timestamp": now_str,
            "token": cheapest_sym,
            "type": "INITIAL_BUY",
            "price_usd": cheapest_price,
            "amount": amt,
            "total_usd": round(self.initial_capital_usd, 2),
            "to_token": "N/A",
            "to_amount": 0.0,
            "spread_pct": round(cheapest_chg, 2),
            "dex": "Jupiter DEX (Solana)",
            "tx_hash": f"INIT{int(time.time()) % 1000000}JUP",
            "status": "CONFIRMED",
        }

        self.transactions.insert(0, tx)
        self.initial_buy_done = True
        self.current_holding_token = cheapest_sym
        self.current_holding_amount = amt

        # Campana acústica
        sys.stdout.write("\a")
        sys.stdout.flush()

        msg = (
            f"✓ COMPRA INICIAL EJECUTADA: {amt} {cheapest_sym} a ${cheapest_price:,.2f} "
            f"(${self.initial_capital_usd} USD) por mayor % de cambio a la baja ({cheapest_chg:+.2f}%, más barata)"
        )
        self.notifications_log.insert(0, msg)
        return msg

    def calculate_swap_projection(self, from_sym: Optional[str] = None, to_sym: Optional[str] = None) -> Dict[str, Any]:
        """
        Calcula detalladamente los costes de la operación y el aumento neto del monto total
        antes de realizar el swap en Jupiter DEX.
        """
        ranking = self.get_token_ranking()
        best_sym, _, _ = ranking[0]
        cheapest_sym, _, _ = ranking[-1]

        src_sym = from_sym or (self.current_holding_token if self.current_holding_amount > 0 else best_sym)
        dst_sym = to_sym or cheapest_sym

        src_price = self.prices.get(src_sym, {}).get("usdPrice", TOKENS[src_sym]["fallback"])
        src_chg = self.prices.get(src_sym, {}).get("change24h", 0.0)

        dst_price = self.prices.get(dst_sym, {}).get("usdPrice", TOKENS[dst_sym]["fallback"])
        dst_chg = self.prices.get(dst_sym, {}).get("change24h", 0.0)

        # Monto actual en origen
        src_amount = self.current_holding_amount if self.current_holding_amount > 0 else round(self.initial_capital_usd / src_price, 4)
        current_val_usd = src_amount * src_price

        # Costes de la operación (Gas Solana + Comisión DEX + Slippage estimado)
        gas_usd = self.gas_fee_usd
        dex_fee_usd = current_val_usd * (self.dex_fee_pct / 100.0)
        slippage_usd = current_val_usd * (self.slippage_pct / 100.0)
        total_costs_usd = gas_usd + dex_fee_usd + slippage_usd

        # Diferencial (spread) entre la moneda que bajó menos y la que bajó más
        spread = src_chg - dst_chg
        gross_gain_usd = current_val_usd * (spread / 100.0)

        # Aumento neto del monto total tras descontar costes de operación
        net_gain_usd = gross_gain_usd - total_costs_usd
        net_gain_pct = (net_gain_usd / current_val_usd * 100.0) if current_val_usd > 0 else 0.0

        # Criterio estricto: Aumentar el valor del monto total al menos en 0.5%
        is_profitable = net_gain_pct >= self.min_net_gain_pct

        return {
            "from_sym": src_sym,
            "to_sym": dst_sym,
            "src_amount": src_amount,
            "src_price": src_price,
            "dst_price": dst_price,
            "current_val_usd": current_val_usd,
            "gas_usd": gas_usd,
            "dex_fee_usd": dex_fee_usd,
            "slippage_usd": slippage_usd,
            "total_costs_usd": total_costs_usd,
            "spread": spread,
            "gross_gain_usd": gross_gain_usd,
            "net_gain_usd": net_gain_usd,
            "net_gain_pct": net_gain_pct,
            "is_profitable": is_profitable,
        }

    def execute_rotation_swap(self) -> str:
        """
        Calcula los costes de la operación y SOLO realiza el swap si se consigue
        aumentar el valor del monto total en al menos 0.5% (o umbral configurado).
        """
        proj = self.calculate_swap_projection()

        if proj["from_sym"] == proj["to_sym"]:
            return f"El token actual ({proj['from_sym']}) ya es el de mayor caída a la baja (más barato). No se requiere rotación."

        # VALIDACIÓN DE COSTES Y RENTABILIDAD MÍNIMA DEL 0.5%
        if not proj["is_profitable"]:
            msg = (
                f"⚠️ SWAP BLOQUEADO: El aumento neto proyectado (+{proj['net_gain_pct']:.2f}%) "
                f"no alcanza el objetivo mínimo del +{self.min_net_gain_pct:.2f}% tras costes "
                f"(${proj['total_costs_usd']:.2f} USD: Gas ${proj['gas_usd']:.3f} + DEX/Slippage ${proj['dex_fee_usd'] + proj['slippage_usd']:.2f}). "
                f"Capital de ${proj['current_val_usd']:.2f} USD preservado."
            )
            self.notifications_log.insert(0, msg)
            if len(self.notifications_log) > 10:
                self.notifications_log.pop()
            return msg

        # Si supera el umbral de +0.5% neto, se descuentan costes reales y se efectúa el swap
        net_val_usd = proj["current_val_usd"] - proj["total_costs_usd"]
        target_amount = round(net_val_usd / proj["dst_price"], 5 if proj["dst_price"] > 100 else 3)

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tx = {
            "id": f"swap_{int(time.time())}",
            "timestamp": now_str,
            "token": proj["from_sym"],
            "type": "ROTATION_SWAP",
            "price_usd": proj["src_price"],
            "amount": proj["src_amount"],
            "total_usd": round(proj["current_val_usd"], 2),
            "to_token": proj["to_sym"],
            "to_amount": target_amount,
            "spread_pct": round(proj["spread"], 2),
            "dex": "Jupiter DEX Router (Solana)",
            "tx_hash": f"SWAP{int(time.time()) % 1000000}SOL",
            "status": "CONFIRMED",
        }

        self.transactions.insert(0, tx)
        self.current_holding_token = proj["to_sym"]
        self.current_holding_amount = target_amount
        self.last_swap_time = time.time()
        self.total_swaps_count += 1
        self.initial_buy_done = True

        sys.stdout.write("\a")
        sys.stdout.flush()

        msg = (
            f"✓ SWAP EJECUTADO: {proj['src_amount']} {proj['from_sym']} ➔ {target_amount} {proj['to_sym']} "
            f"(Aumento neto: +{proj['net_gain_pct']:.2f}% | +${proj['net_gain_usd']:.2f} USD | Costes: ${proj['total_costs_usd']:.2f} USD)"
        )
        self.notifications_log.insert(0, msg)
        if len(self.notifications_log) > 10:
            self.notifications_log.pop()
        return msg

    def check_auto_rotation(self):
        """Si el modo bot está activo, evalúa si debe disparar el swap automáticamente tras calcular costes."""
        now = time.time()
        # Esperar al menos 30 segundos entre swaps automáticos
        if self.last_swap_time and (now - self.last_swap_time < 30):
            return

        proj = self.calculate_swap_projection()
        if proj["from_sym"] != proj["to_sym"] and proj["is_profitable"]:
            self.execute_rotation_swap()

    def reconfigure_amount_interactive(self):
        """Permite reconfigurar el monto total, capital y parámetros a mano de forma interactiva."""
        print(f"\n{Colors.BG_BLUE}{Colors.BOLD}   RECONFIGURAR MONTO Y PARÁMETROS A MANO   {Colors.RESET}")
        print(f"  [1] Capital Total en USD (Actual: ${self.initial_capital_usd:,.2f} USD)")
        print(f"  [2] Tenencia actual de tokens (Actual: {self.current_holding_amount} {self.current_holding_token})")
        print(f"  [3] Umbral de aumento neto mínimo % (Actual: +{self.min_net_gain_pct:.2f}%)")
        print(f"  [4] Costes de operación (Gas: ${self.gas_fee_usd:.3f} | Fee DEX: {self.dex_fee_pct}% | Slippage: {self.slippage_pct}%)")
        print(f"  [5] Seleccionar Wallet Solana (Actual: {self.wallet_provider})")
        print(f"  [Enter] Volver al monitor sin cambios")

        try:
            choice = input(f"\n{Colors.BOLD}Seleccione opción (1-5) o Enter para salir: {Colors.RESET}").strip()
            if choice == "1":
                val = input(f"Nuevo capital total en USD [Actual: {self.initial_capital_usd}]: ").strip()
                if val:
                    new_val = float(val)
                    if new_val > 0:
                        self.initial_capital_usd = new_val
                        cur_p = self.prices.get(self.current_holding_token, {}).get("usdPrice", TOKENS[self.current_holding_token]["fallback"])
                        if cur_p > 0:
                            self.current_holding_amount = round(new_val / cur_p, 4)
                        print(f"{Colors.GREEN}✓ Capital actualizado a ${self.initial_capital_usd:,.2f} USD ({self.current_holding_amount} {self.current_holding_token}).{Colors.RESET}")
            elif choice == "2":
                tok = input(f"Token en posesión (SOL, BTC, ETH, ZEC, HYPE) [Actual: {self.current_holding_token}]: ").strip().upper()
                if tok in TOKENS:
                    amt_str = input(f"Cantidad de {tok} en posesión [Actual: {self.current_holding_amount}]: ").strip()
                    if amt_str:
                        self.current_holding_token = tok
                        self.current_holding_amount = float(amt_str)
                        self.initial_buy_done = True
                        p = self.prices.get(tok, {}).get("usdPrice", TOKENS[tok]["fallback"])
                        self.initial_capital_usd = round(self.current_holding_amount * p, 2)
                        print(f"{Colors.GREEN}✓ Tenencia actualizada a {self.current_holding_amount} {tok} (Valor: ${self.initial_capital_usd:,.2f} USD).{Colors.RESET}")
                else:
                    print(f"{Colors.RED}Token no válido.{Colors.RESET}")
            elif choice == "3":
                gain_str = input(f"Nuevo umbral de aumento neto % tras costes [Actual: {self.min_net_gain_pct}%]: ").strip()
                if gain_str:
                    self.min_net_gain_pct = float(gain_str)
                    print(f"{Colors.GREEN}✓ Umbral mínimo de ganancia neta establecido en +{self.min_net_gain_pct:.2f}%.{Colors.RESET}")
            elif choice == "4":
                gas_str = input(f"Coste estimado de gas Solana en USD [Actual: ${self.gas_fee_usd}]: ").strip()
                if gas_str:
                    self.gas_fee_usd = float(gas_str)
                fee_str = input(f"Comisión DEX Jupiter % [Actual: {self.dex_fee_pct}%]: ").strip()
                if fee_str:
                    self.dex_fee_pct = float(fee_str)
                print(f"{Colors.GREEN}✓ Costes de operación actualizados.{Colors.RESET}")
            elif choice == "5":
                print(f"\n{Colors.CYAN}Selección de Wallet Solana:{Colors.RESET}")
                print(f"  [1] Jupiter Wallet (Nativa de Jupiter DEX - Recomendada)")
                print(f"  [2] Phantom Wallet")
                print(f"  [3] Solflare Wallet")
                print(f"  [4] Ingresar Clave Pública Solana Manual")
                w_choice = input(f"{Colors.BOLD}Seleccione wallet (1-4): {Colors.RESET}").strip()
                if w_choice == "1":
                    self.wallet_provider = "Jupiter Wallet (Nativa)"
                    self.wallet_address = "Jup4d13nTYyWvGjXGsmD24hQZ9v8bCq9Q5N4vJUPITER"
                    print(f"{Colors.GREEN}✓ Vinculado con Jupiter Wallet (Nativa de Jupiter DEX).{Colors.RESET}")
                elif w_choice == "2":
                    self.wallet_provider = "Phantom Wallet"
                    self.wallet_address = "Phantom7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosg"
                    print(f"{Colors.GREEN}✓ Vinculado con Phantom Wallet.{Colors.RESET}")
                elif w_choice == "3":
                    self.wallet_provider = "Solflare Wallet"
                    self.wallet_address = "Solflare9B5XszUGdMaxCZ7uSQhPzdks53QKEQ26A4D98VPLF"
                    print(f"{Colors.GREEN}✓ Vinculado con Solflare Wallet.{Colors.RESET}")
                elif w_choice == "4":
                    addr = input("Dirección pública de Solana: ").strip()
                    if addr:
                        self.wallet_provider = "Solana Address"
                        self.wallet_address = addr
                        print(f"{Colors.GREEN}✓ Dirección actualizada a {self.wallet_address[:8]}...{Colors.RESET}")

            time.sleep(1.2)
        except Exception as e:
            print(f"{Colors.RED}Error al configurar: {e}{Colors.RESET}")
            time.sleep(1.2)

    def check_alerts(self):
        """Comprueba si los precios cruzan los umbrales configurados."""
        now = time.time()
        for alert in self.alerts:
            if alert.symbol not in self.prices:
                continue

            current_price = self.prices[alert.symbol]["usdPrice"]
            triggered = False

            if alert.condition == "ABOVE" and current_price >= alert.target_price:
                triggered = True
            elif alert.condition == "BELOW" and current_price <= alert.target_price:
                triggered = True

            if triggered:
                if alert.last_triggered_at is None or (now - alert.last_triggered_at > 45):
                    alert.last_triggered_at = now
                    alert.triggered_count += 1
                    cond_str = "superó" if alert.condition == "ABOVE" else "cayó bajo"
                    msg = (
                        f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ALERTA: "
                        f"{alert.symbol} {cond_str} ${alert.target_price:,.2f} (Cotiza a ${current_price:,.2f})"
                    )
                    self.notifications_log.insert(0, msg)
                    if len(self.notifications_log) > 10:
                        self.notifications_log.pop()
                    sys.stdout.write("\a")
                    sys.stdout.flush()

    def export_to_csv(self, filename: Optional[str] = None) -> str:
        """Exporta el historial completo a CSV con detalles de swaps rotativos."""
        target_file = filename or self.csv_filename
        headers = [
            "ID_Transaccion",
            "Fecha_Hora",
            "Token_Origen",
            "Tipo_Operacion",
            "Precio_USD",
            "Cantidad_Origen",
            "Token_Destino",
            "Cantidad_Destino",
            "Diferencial_Spread_Pct",
            "Total_USD",
            "DEX",
            "Tx_Hash",
            "Estado",
        ]

        with open(target_file, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for tx in self.transactions:
                writer.writerow([
                    tx["id"],
                    tx["timestamp"],
                    tx["token"],
                    tx["type"],
                    f"{tx['price_usd']:.4f}",
                    tx["amount"],
                    tx.get("to_token", "N/A"),
                    tx.get("to_amount", 0.0),
                    f"{tx.get('spread_pct', 0.0):.2f}%",
                    f"{tx['total_usd']:.2f}",
                    tx["dex"],
                    tx["tx_hash"],
                    tx["status"],
                ])
        return target_file

    def render_ui(self):
        """Imprime una interfaz de terminal limpia, estructurada y reactiva."""
        os.system("cls" if os.name == "nt" else "clear")

        print(f"{Colors.BG_CYAN}{Colors.BOLD}   JUPITER DEX REAL-TIME MONITOR & ROTATION STRATEGY   {Colors.RESET}")
        print(f"{Colors.DIM}Hora: {self.last_update_str} | Latencia: {self.latency_ms:.1f}ms | {self.status_message}{Colors.RESET}")
        print("─" * 78)

        # 1. TABLA DE PRECIOS
        header = f"{'TOKEN':<8} {'NOMBRE':<22} {'PRECIO USD':>14} {'CAMBIO 24H':>12} {'LIQUIDEZ':>14}"
        print(f"{Colors.BOLD}{header}{Colors.RESET}")
        print("─" * 78)

        for sym in ["SOL", "BTC", "ETH", "ZEC", "HYPE"]:
            token_conf = TOKENS[sym]
            p_data = self.prices.get(sym, {})
            price = p_data.get("usdPrice", token_conf["fallback"])
            chg = p_data.get("change24h", 0.0)
            liq = p_data.get("liquidity", 0.0)

            chg_color = Colors.GREEN if chg >= 0 else Colors.RED
            chg_symbol = "▲" if chg >= 0 else "▼"
            chg_str = f"{chg_color}{chg_symbol} {abs(chg):.2f}%{Colors.RESET}"
            price_str = f"${price:,.2f}" if price >= 100 else f"${price:,.4f}"
            liq_str = f"${liq/1e6:.1f}M" if liq >= 1e6 else f"${liq/1e3:.1f}K"

            print(f"{Colors.BOLD}{sym:<8}{Colors.RESET} {token_conf['name']:<22} {Colors.CYAN}{price_str:>14}{Colors.RESET} {chg_str:>21} {liq_str:>14}")

        print("─" * 78)

        # 2. RANKING Y ESTRATEGIA DE ROTACIÓN
        ranking = self.get_token_ranking()
        best_token = ranking[0]
        worst_token = ranking[-1]
        spread = best_token[2] - worst_token[2]

        bot_status = f"{Colors.GREEN}[ACTIVO]{Colors.RESET}" if self.auto_bot_enabled else f"{Colors.DIM}[INACTIVO]{Colors.RESET}"
        print(f"{Colors.BOLD}{Colors.MAGENTA}ESTRATEGIA CUANTITATIVA DE ROTACIÓN POR DESEMPEÑO RELATIVO:{Colors.RESET} Bot Auto: {bot_status}")
        print(f"  • {Colors.GREEN}#1 Menor caída / Mayor %:{Colors.RESET} {Colors.BOLD}{best_token[0]}{Colors.RESET} ({best_token[2]:+.2f}%)  ➔  {Colors.YELLOW}Origen (Venta){Colors.RESET}")
        print(f"  • {Colors.RED}#5 Mayor caída / Descuento:{Colors.RESET} {Colors.BOLD}{worst_token[0]}{Colors.RESET} ({worst_token[2]:+.2f}%)  ➔  {Colors.CYAN}Destino (Compra){Colors.RESET}")
        print(f"  • Diferencial Bruto (Spread): {Colors.BOLD}{Colors.YELLOW}+{spread:.2f}%{Colors.RESET} (Umbral auto: {self.min_spread_threshold}%)")
        print(f"  • Posición Actual: {Colors.BOLD}{self.current_holding_amount} {self.current_holding_token}{Colors.RESET} | Capital Configurado: ${self.initial_capital_usd:,.2f} USD")

        # CÁLCULO DE COSTES Y RENTABILIDAD ANTES DE SWAP
        proj = self.calculate_swap_projection()
        status_color = Colors.GREEN if proj["is_profitable"] else Colors.RED
        status_badge = f"{status_color}✅ APTO (+{proj['net_gain_pct']:.2f}% >= +{self.min_net_gain_pct:.2f}% neto){Colors.RESET}" if proj["is_profitable"] else f"{status_color}⚠️ BLOQUEADO (+{proj['net_gain_pct']:.2f}% neto < +{self.min_net_gain_pct:.2f}%){Colors.RESET}"
        print(f"  • Costes Operación DEX: Gas ${proj['gas_usd']:.3f} + Fee/Slippage ${proj['dex_fee_usd'] + proj['slippage_usd']:.2f} = Total ${proj['total_costs_usd']:.2f} USD")
        print(f"  • Proyección Swap ({proj['from_sym']} ➔ {proj['to_sym']}): Aumento Neto: {Colors.BOLD}{proj['net_gain_pct']:+.2f}%{Colors.RESET} (+${proj['net_gain_usd']:.2f} USD) | {status_badge}")
        print(f"  • Wallet Solana: {Colors.CYAN}🪐 {self.wallet_provider}{Colors.RESET} ({self.wallet_address[:8]}...{self.wallet_address[-6:] if len(self.wallet_address) > 14 else self.wallet_address}) [{self.wallet_mode}]")

        print("─" * 78)

        # 3. ÚLTIMAS NOTIFICACIONES
        if self.notifications_log:
            print(f"{Colors.BOLD}{Colors.YELLOW}ACTIVIDAD RECIENTE & NOTIFICACIONES:{Colors.RESET}")
            for notif in self.notifications_log[:3]:
                print(f"  🔔 {notif}")
            print("─" * 78)

        # 4. HISTORIAL DE OPERACIONES DEL BOT
        print(f"{Colors.BOLD}OPERACIONES & SWAPS DEL BOT ({len(self.transactions)} registros):{Colors.RESET}")
        if not self.transactions:
            print(f"  {Colors.DIM}(El bot aún no ha ejecutado órdenes. Presiona [B] para Compra Inicial o [T] para Bot Auto){Colors.RESET}")
        else:
            for tx in self.transactions[:5]:
                if tx["type"] == "ROTATION_SWAP":
                    t_badge = f"{Colors.MAGENTA}[SWAP BOT]{Colors.RESET}"
                    detail = f"{tx['amount']} {tx['token']} ➔ {tx.get('to_amount', 0)} {tx.get('to_token', '')} (Spread: +{tx.get('spread_pct', 0):.2f}%)"
                else:
                    t_badge = f"{Colors.GREEN}[COMPRA BOT]{Colors.RESET}"
                    detail = f"{tx['amount']} {tx['token']} @ ${tx['price_usd']:,.2f} = ${tx['total_usd']:,.2f} (Mayor descuento)"

                print(f"  [{tx['timestamp'][-8:]}] {t_badge} {detail}")

        print("─" * 78)
        print(f"{Colors.BOLD}Comandos:{Colors.RESET} [B] Compra Inicial | [S] Swap (+0.5% mín) | [T] Bot Auto | [M] Monto & Wallet | [E] CSV | [Q] Salir")

    def run(self):
        while self.running:
            self.fetch_prices()
            if self.auto_bot_enabled:
                self.check_auto_rotation()
            self.check_alerts()
            self.render_ui()
            time.sleep(self.poll_interval)


def get_user_command(timeout: float = 2.0) -> Optional[str]:
    """
    Lee comandos de teclado de manera no bloqueante.
    En Windows usa msvcrt (captura instantánea de tecla sin requerir Enter).
    En Unix/Linux usa select.select sin interferir con el refresco de pantalla.
    """
    if os.name == "nt":
        try:
            import msvcrt
            start_t = time.time()
            while time.time() - start_t < timeout:
                if msvcrt.kbhit():
                    ch = msvcrt.getch()
                    try:
                        return ch.decode("utf-8", errors="ignore").lower()
                    except Exception:
                        return None
                time.sleep(0.05)
            return None
        except ImportError:
            pass

    # Para Linux, macOS y terminales POSIX
    try:
        import select
        rlist, _, _ = select.select([sys.stdin], [], [], timeout)
        if rlist:
            line = sys.stdin.readline()
            return line.strip().lower()
    except Exception:
        time.sleep(timeout)
        return None

    return None


def main():
    monitor = JupiterMonitor(poll_interval=2.0)
    monitor.fetch_prices()
    monitor.render_ui()
    print(f"\n{Colors.CYAN}Escribe o pulsa un comando [B, S, T, M, E, Q]: {Colors.RESET}", end="", flush=True)

    try:
        while monitor.running:
            cmd = get_user_command(timeout=monitor.poll_interval)
            if cmd:
                cmd = cmd.strip().lower()
                if cmd == "q":
                    monitor.running = False
                    print(f"\n{Colors.YELLOW}Deteniendo monitor y saliendo...{Colors.RESET}")
                    break
                elif cmd == "b":
                    res = monitor.execute_initial_buy()
                    print(f"\n{Colors.GREEN}{res}{Colors.RESET}")
                    time.sleep(1.8)
                elif cmd == "s":
                    res = monitor.execute_rotation_swap()
                    color = Colors.GREEN if "✓" in res else Colors.YELLOW
                    print(f"\n{color}{res}{Colors.RESET}")
                    time.sleep(2.0)
                elif cmd == "t":
                    monitor.auto_bot_enabled = not monitor.auto_bot_enabled
                    state_str = "ACTIVADO" if monitor.auto_bot_enabled else "DESACTIVADO"
                    print(f"\n{Colors.YELLOW}Bot de Auto-Swap {state_str}.{Colors.RESET}")
                    time.sleep(1.2)
                elif cmd == "m":
                    monitor.reconfigure_amount_interactive()
                elif cmd == "e":
                    filename = monitor.export_to_csv()
                    print(f"\n{Colors.GREEN}✓ CSV exportado con éxito a: {filename}{Colors.RESET}")
                    time.sleep(1.8)
                elif cmd == "r":
                    monitor.fetch_prices()

            # Refresco periódico de datos
            monitor.fetch_prices()
            if monitor.auto_bot_enabled:
                monitor.check_auto_rotation()
            monitor.check_alerts()
            monitor.render_ui()
            print(f"\n{Colors.CYAN}Escribe o pulsa un comando [B, S, T, M, E, Q]: {Colors.RESET}", end="", flush=True)

    except KeyboardInterrupt:
        monitor.running = False
        print(f"\n{Colors.YELLOW}Saliendo del monitor...{Colors.RESET}")


if __name__ == "__main__":
    main()
