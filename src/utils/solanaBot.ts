import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { CryptoSymbol } from "../types";

export const JUPITER_TOKEN_MINTS: Record<CryptoSymbol, { mint: string; decimals: number }> = {
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  BTC: { mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", decimals: 8 }, // Portal WBTC (Máxima liquidez y soporte nativo en Jupiter)
  ETH: { mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", decimals: 8 }, // WETH (Portal / Wormhole)
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 }, // Jupiter DEX Native Token
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 }, // Circle Native USD Coin
  ZEC: { mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS", decimals: 8 }, // OmniBridge ZEC
};

// Mints alternativos para encontrar rutas de liquidez en Jupiter si un wrapper específico no tiene pool directo
export const ALTERNATIVE_TOKEN_MINTS: Record<CryptoSymbol, string[]> = {
  SOL: ["So11111111111111111111111111111111111111112"],
  BTC: [
    "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // Portal WBTC
    "cbbtcf3aa214zXHbiAZQwf4122FmVbraDgTagqWphU7", // cbBTC
  ],
  ETH: [
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // Portal WETH
  ],
  JUP: [
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  ],
  USDC: [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  ],
  ZEC: [
    "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS", // OmniBridge ZEC
  ],
};

// Endpoints oficiales y públicos resilientes de Jupiter DEX v1
export const JUPITER_API_BASES = [
  "https://public.jupiterapi.com",
  "/api/jupiter",
  "https://api.jup.ag/swap/v1",
];

export const DEFAULT_FEE_COLLECTOR = "Crtx4oJReqAcgucCMmB4v3YjUV8SmXUk5CzwVeqdJyfu"; // Wallet de cobro de comisiones de Jupiter DEX
export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

// Lista de RPCs públicos resilientes con fallback automático
export const FALLBACK_SOLANA_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];

export interface BotKeypairData {
  publicKey: string;
  secretKeyBase58: string;
}

const STORAGE_KEY = "pacharolo_bot_keypair";
const FEE_CONFIG_KEY = "pacharolo_platform_fee_config";

/**
 * Obtiene o genera una sub-wallet de trading exclusiva para el bot
 */
export function getOrCreateBotKeypair(): BotKeypairData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.publicKey && parsed?.secretKeyBase58) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error reading stored bot keypair:", e);
  }

  // Generar nuevo par criptográfico de Solana
  const newPair = Keypair.generate();
  const secretKeyBase58 = bs58.encode(newPair.secretKey);
  const data: BotKeypairData = {
    publicKey: newPair.publicKey.toBase58(),
    secretKeyBase58,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Error saving bot keypair:", e);
  }

  return data;
}

export const WALLET_UPDATED_EVENT = "pacharolo_wallet_updated";

/**
 * Valida y analiza una clave privada ingresada por el usuario (Base58 o JSON byte array)
 */
export function validatePrivateKey(privateKeyInput: string): {
  valid: boolean;
  publicKey?: string;
  secretKeyBase58?: string;
  error?: string;
} {
  const trimmed = privateKeyInput.trim();
  if (!trimmed) {
    return { valid: false, error: "Ingresa tu clave privada." };
  }

  try {
    let secretKeyBytes: Uint8Array;

    // Detectar si es un array JSON de bytes (formato Solana CLI / Solflare JSON)
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && (parsed.length === 64 || parsed.length === 32)) {
          secretKeyBytes = new Uint8Array(parsed);
        } else {
          return {
            valid: false,
            error: "El array de bytes debe tener 64 números (clave completa) o 32 números (seed).",
          };
        }
      } catch {
        return { valid: false, error: "Formato de array JSON inválido." };
      }
    } else {
      // Intentar decodificar como cadena Base58 (Phantom / Solflare estándar)
      try {
        secretKeyBytes = bs58.decode(trimmed);
      } catch {
        return {
          valid: false,
          error: "Formato Base58 inválido. Asegúrate de copiar la clave privada completa sin espacios extra.",
        };
      }
    }

    let keypair: Keypair;
    if (secretKeyBytes.length === 64) {
      keypair = Keypair.fromSecretKey(secretKeyBytes);
    } else if (secretKeyBytes.length === 32) {
      keypair = Keypair.fromSeed(secretKeyBytes);
    } else {
      return {
        valid: false,
        error: `Longitud no válida (${secretKeyBytes.length} bytes). Se esperan 64 bytes (o seed de 32 bytes).`,
      };
    }

    return {
      valid: true,
      publicKey: keypair.publicKey.toBase58(),
      secretKeyBase58: bs58.encode(keypair.secretKey),
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || "No se pudo derivar el par de claves desde la clave privada provista.",
    };
  }
}

/**
 * Guarda y activa una clave privada importada
 */
export function importBotKeypair(privateKeyInput: string): {
  success: boolean;
  data?: BotKeypairData;
  error?: string;
} {
  const validation = validatePrivateKey(privateKeyInput);
  if (!validation.valid || !validation.publicKey || !validation.secretKeyBase58) {
    return { success: false, error: validation.error || "Clave privada inválida." };
  }

  const data: BotKeypairData = {
    publicKey: validation.publicKey,
    secretKeyBase58: validation.secretKeyBase58,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT, { detail: data }));
    }
  } catch (e) {
    console.error("Error saving imported bot keypair:", e);
  }

  return { success: true, data };
}

/**
 * Regenera una nueva sub-wallet criptográfica
 */
export function regenerateBotKeypair(): BotKeypairData {
  const newPair = Keypair.generate();
  const secretKeyBase58 = bs58.encode(newPair.secretKey);
  const data: BotKeypairData = {
    publicKey: newPair.publicKey.toBase58(),
    secretKeyBase58,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT, { detail: data }));
    }
  } catch (e) {
    console.error("Error saving regenerated bot keypair:", e);
  }
  return data;
}

/**
 * Carga el Keypair de Solana desde la clave secreta guardada
 */
export function loadKeypairFromSecret(secretKeyBase58: string): Keypair | null {
  try {
    const secretKey = bs58.decode(secretKeyBase58);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("Invalid secret key:", e);
    return null;
  }
}

/**
 * Consulta el balance real en SOL de una dirección en Solana usando el backend rápido o RPCs públicos
 */
export async function fetchSolBalance(publicKeyStr: string): Promise<number> {
  if (!publicKeyStr || publicKeyStr.length < 32) return 0;

  // 1. Intentar primero con el endpoint local optimizado del backend (/api/wallet/holdings)
  try {
    const res = await fetch(`/api/wallet/holdings/${publicKeyStr}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.solBalance === "number") {
        return data.solBalance;
      }
    }
  } catch {}

  // 2. Probar endpoints con JSON-RPC directo y timeout corto (evita bloqueos)
  for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [publicKeyStr, { commitment: "confirmed" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        if (json && json.result && typeof json.result.value === "number") {
          return json.result.value / LAMPORTS_PER_SOL;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback final
  try {
    const connection = new Connection(DEFAULT_SOLANA_RPC, "confirmed");
    const pubKey = new PublicKey(publicKeyStr);
    const lamports = await connection.getBalance(pubKey);
    return lamports / LAMPORTS_PER_SOL;
  } catch (err) {
    console.warn("Could not query Solana RPC balance directly:", err);
    return 0;
  }
}

/**
 * Consulta la tenencia real de todos los tokens soportados (SOL, BTC, ETH, ZEC) en la sub-wallet
 */
export async function fetchWalletTokenHoldings(
  publicKeyStr: string,
  tokenPrices?: Partial<Record<CryptoSymbol, number>>
): Promise<Record<CryptoSymbol, { symbol: CryptoSymbol; balance: number; rawAmount: string; decimals: number; usdValue: number; mint: string }>> {
  const holdings: Record<CryptoSymbol, { symbol: CryptoSymbol; balance: number; rawAmount: string; decimals: number; usdValue: number; mint: string }> = {
    SOL: { symbol: "SOL", balance: 0, rawAmount: "0", decimals: 9, usdValue: 0, mint: JUPITER_TOKEN_MINTS.SOL.mint },
    BTC: { symbol: "BTC", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: JUPITER_TOKEN_MINTS.BTC.mint },
    ETH: { symbol: "ETH", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: JUPITER_TOKEN_MINTS.ETH.mint },
    JUP: { symbol: "JUP", balance: 0, rawAmount: "0", decimals: 6, usdValue: 0, mint: JUPITER_TOKEN_MINTS.JUP.mint },
    USDC: { symbol: "USDC", balance: 0, rawAmount: "0", decimals: 6, usdValue: 0, mint: JUPITER_TOKEN_MINTS.USDC.mint },
    ZEC: { symbol: "ZEC", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: JUPITER_TOKEN_MINTS.ZEC.mint },
  };

  if (!publicKeyStr || publicKeyStr.length < 32) return holdings;

  // 1. Intentar primero a través del backend (/api/wallet/holdings) que responde en ~100ms sin CORS ni rate-limit
  try {
    const res = await fetch(`/api/wallet/holdings/${publicKeyStr}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.holdings) {
        for (const sym of ["SOL", "BTC", "ETH", "JUP", "USDC", "ZEC"] as CryptoSymbol[]) {
          const item = data.holdings[sym];
          if (item) {
            const price = tokenPrices?.[sym] || item.usdValue || 0;
            holdings[sym] = {
              symbol: sym,
              balance: Number(item.balance || 0),
              rawAmount: String(item.rawAmount || "0"),
              decimals: Number(item.decimals || (sym === "SOL" ? 9 : sym === "JUP" || sym === "USDC" ? 6 : 8)),
              usdValue: Number((Number(item.balance || 0) * price).toFixed(2)),
              mint: item.mint || JUPITER_TOKEN_MINTS[sym].mint,
            };
          }
        }
        return holdings;
      }
    }
  } catch (backendErr) {
    console.warn("Backend holdings query failed, falling back to direct RPCs:", backendErr);
  }

  // 2. Fallback con JSON-RPC directo a Solana
  try {
    const pubKey = new PublicKey(publicKeyStr);

    // Saldo nativo de SOL
    const solBal = await fetchSolBalance(publicKeyStr);
    holdings.SOL.balance = solBal;
    holdings.SOL.rawAmount = Math.floor(solBal * LAMPORTS_PER_SOL).toString();
    const solPrice = tokenPrices?.SOL || 101.14;
    holdings.SOL.usdValue = Number((solBal * solPrice).toFixed(2));

    // Cuentas de tokens SPL en la sub-wallet vía JSON-RPC directo
    let tokenAccounts: any[] = [];
    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "getTokenAccountsByOwner",
            params: [
              publicKeyStr,
              { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
              { encoding: "jsonParsed" },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          if (json && json.result && Array.isArray(json.result.value)) {
            tokenAccounts = json.result.value;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    for (const item of tokenAccounts) {
      const info = item.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint;
      const uiAmount = Number(info.tokenAmount?.uiAmount || 0);
      const rawAmount = String(info.tokenAmount?.amount || "0");
      const decimals = Number(info.tokenAmount?.decimals || 8);

      for (const sym of ["BTC", "ETH", "JUP", "USDC", "ZEC"] as CryptoSymbol[]) {
        const primaryMint = JUPITER_TOKEN_MINTS[sym].mint;
        const altMints = ALTERNATIVE_TOKEN_MINTS[sym] || [];
        if (mint === primaryMint || altMints.includes(mint)) {
          holdings[sym].balance = uiAmount;
          holdings[sym].rawAmount = rawAmount;
          holdings[sym].decimals = decimals;
          holdings[sym].mint = mint;
          const price = tokenPrices?.[sym] || 0;
          holdings[sym].usdValue = Number((uiAmount * price).toFixed(2));
        }
      }
    }
  } catch (err) {
    console.warn("[fetchWalletTokenHoldings] Error al consultar tenencias:", err);
  }

  return holdings;
}

const PENDING_FEE_KEY = "pacharolo_pending_creator_fee_lamports";

export function getPendingCreatorFeeLamports(): number {
  try {
    const val = localStorage.getItem(PENDING_FEE_KEY);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

export function setPendingCreatorFeeLamports(lamports: number): void {
  try {
    localStorage.setItem(PENDING_FEE_KEY, String(Math.max(0, Math.floor(lamports))));
  } catch (e) {
    console.warn("Could not save pending fee lamports:", e);
  }
}

export interface CreatorWalletStatus {
  address: string;
  isRentExempt: boolean;
  balanceSol: number;
  minRentLamports: number;
  minRentSol: number;
  pendingFeeLamports: number;
  pendingFeeSol: number;
}

/**
 * Consulta el estado on-chain de la wallet del creador para verificar si está activa y exenta de renta en Solana
 */
export async function checkCreatorWalletStatus(creatorAddress = DEFAULT_FEE_COLLECTOR): Promise<CreatorWalletStatus> {
  const cleanAddress = (creatorAddress || DEFAULT_FEE_COLLECTOR).trim();
  const pendingFeeLamports = getPendingCreatorFeeLamports();
  const pendingFeeSol = pendingFeeLamports / LAMPORTS_PER_SOL;

  // 1. Intentar consulta ultrarrápida a través del proxy del backend (sin problemas de CORS ni rate-limits de navegador)
  try {
    const res = await fetch(`/api/wallet/creator-status/${cleanAddress}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.balanceSol === "number") {
        return {
          address: cleanAddress,
          isRentExempt: Boolean(data.isRentExempt),
          balanceSol: data.balanceSol,
          minRentLamports: data.minRentLamports || 810624,
          minRentSol: data.minRentSol || 0.000810624,
          pendingFeeLamports,
          pendingFeeSol,
        };
      }
    }
  } catch {
    // Si falla el backend, continuar con fallback a nodos RPC directos
  }

  try {
    const pubkey = new PublicKey(cleanAddress);
    for (const rpc of FALLBACK_SOLANA_RPCS) {
      try {
        const connection = new Connection(rpc, "confirmed");
        const [accInfo, minRent] = await Promise.all([
          connection.getAccountInfo(pubkey),
          connection.getMinimumBalanceForRentExemption(0),
        ]);
        const balanceSol = accInfo ? accInfo.lamports / LAMPORTS_PER_SOL : 0;
        const isRentExempt = !!accInfo && accInfo.lamports >= minRent;
        return {
          address: cleanAddress,
          isRentExempt,
          balanceSol,
          minRentLamports: minRent,
          minRentSol: minRent / LAMPORTS_PER_SOL,
          pendingFeeLamports,
          pendingFeeSol,
        };
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.warn("Error checking creator wallet status:", err);
  }

  return {
    address: cleanAddress,
    isRentExempt: false,
    balanceSol: 0,
    minRentLamports: 810624,
    minRentSol: 0.000810624,
    pendingFeeLamports,
    pendingFeeSol,
  };
}

/**
 * Activa la wallet del creador en Solana Mainnet enviando la cantidad mínima de exención de renta (~0.00085 SOL)
 * desde la sub-wallet del bot, permitiendo que reciba micro-tarifas en cualquier transacción sin fallar.
 */
export async function activateCreatorWalletOnChain(params: {
  secretKeyBase58: string;
  creatorWalletAddress?: string;
}): Promise<{ success: boolean; txHash?: string; error?: string; fundedSol?: number }> {
  const { secretKeyBase58, creatorWalletAddress } = params;
  try {
    const keypair = loadKeypairFromSecret(secretKeyBase58);
    if (!keypair) {
      return { success: false, error: "Clave privada del bot inválida." };
    }
    const cleanAddress = (creatorWalletAddress || DEFAULT_FEE_COLLECTOR).trim();
    const destPubkey = new PublicKey(cleanAddress);

    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const connection = new Connection(rpcUrl, { commitment: "confirmed", confirmTransactionInitialTimeout: 15000 });
        const [minRent, senderBalance] = await Promise.all([
          connection.getMinimumBalanceForRentExemption(0),
          connection.getBalance(keypair.publicKey),
        ]);

        const activationLamports = minRent + 10000; // ~0.00082 SOL
        const networkGasFee = 5000;
        if (senderBalance < activationLamports + networkGasFee) {
          return {
            success: false,
            error: `Saldo insuficiente en la sub-wallet (${(senderBalance / LAMPORTS_PER_SOL).toFixed(5)} SOL). Se requieren al menos ${((activationLamports + networkGasFee) / LAMPORTS_PER_SOL).toFixed(5)} SOL para activar la cuenta.`,
          };
        }

        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: destPubkey,
            lamports: activationLamports,
          })
        );
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);

        const rawTx = tx.serialize();
        const txHash = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Esperar confirmación
        await connection.confirmTransaction(txHash, "confirmed");

        // Si había tarifas pendientes acumuladas, ahora que la cuenta está activa se pueden resetear
        setPendingCreatorFeeLamports(0);

        return {
          success: true,
          txHash,
          fundedSol: activationLamports / LAMPORTS_PER_SOL,
        };
      } catch (e: any) {
        console.warn(`[activateCreatorWallet] Error con ${rpcUrl}:`, e?.message);
        continue;
      }
    }
    return { success: false, error: "No se pudo transmitir la activación a través de los nodos RPC." };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al activar la wallet del creador." };
  }
}

/**
 * Transfiere la tarifa del creador (0.15%) on-chain a su wallet mediante SystemProgram.transfer en Solana Mainnet,
 * respetando estrictamente las reglas de exención de renta (Rent-Exemption) del protocolo de Solana.
 */
export async function sendCreatorFeeOnChain(params: {
  secretKeyBase58: string;
  creatorWalletAddress: string;
  feeInSol: number;
}): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  isPendingAccumulated?: boolean;
  accumulatedSol?: number;
}> {
  const { secretKeyBase58, creatorWalletAddress, feeInSol } = params;
  try {
    const keypair = loadKeypairFromSecret(secretKeyBase58);
    if (!keypair) {
      return { success: false, error: "Clave privada del bot inválida." };
    }

    const cleanAddress = (creatorWalletAddress || DEFAULT_FEE_COLLECTOR).trim();
    let destPubkey: PublicKey;
    try {
      destPubkey = new PublicKey(cleanAddress);
    } catch {
      return { success: false, error: `Dirección de wallet del creador inválida: ${cleanAddress}` };
    }

    if (destPubkey.equals(keypair.publicKey)) {
      return { success: false, error: "La wallet del creador no puede ser la misma sub-wallet." };
    }

    const currentFeeLamports = Math.floor(feeInSol * LAMPORTS_PER_SOL);
    if (currentFeeLamports < 500) {
      return { success: false, error: "Monto de tarifa insignificante (< 500 lamports)." };
    }

    // Consultar estado on-chain de la wallet receptora para validar exención de renta
    const status = await checkCreatorWalletStatus(cleanAddress);
    const minRentLamports = status.minRentLamports || 810624;
    const pendingBefore = getPendingCreatorFeeLamports();
    const totalLamportsToSend = currentFeeLamports + pendingBefore;

    // REGLA FUNDAMENTAL DE SOLANA:
    // Si la wallet de destino no está inicializada o tiene 0 SOL (Solscan "Closed Account"),
    // cualquier transferencia menor a minRentLamports (~0.0008106 SOL) ES RECHAZADA por Solana con
    // InsufficientFundsForRent.
    if (!status.isRentExempt && totalLamportsToSend < minRentLamports) {
      // Acumular la comisión de forma segura en local para enviarla cuando alcance el umbral
      // o cuando la cuenta sea activada con un depósito.
      setPendingCreatorFeeLamports(totalLamportsToSend);
      console.log(
        `[FeeCollector] Wallet del creador (${cleanAddress}) inactiva en Solana (0 SOL). ` +
        `Comisión acumulada en cola: ${totalLamportsToSend} lamports (${(totalLamportsToSend / LAMPORTS_PER_SOL).toFixed(6)} SOL). ` +
        `Se transferirá on-chain al alcanzar el mínimo de renta (${(minRentLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL) o al activarla.`
      );
      return {
        success: true,
        isPendingAccumulated: true,
        accumulatedSol: totalLamportsToSend / LAMPORTS_PER_SOL,
        error: `Comisión de ${(currentFeeLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL en cola acumulativa (${(totalLamportsToSend / LAMPORTS_PER_SOL).toFixed(5)} SOL total). Se enviará on-chain en el próximo swap al superar el umbral de renta de Solana (~${(minRentLamports / LAMPORTS_PER_SOL).toFixed(5)} SOL).`,
      };
    }

    let txHash = "";
    let lastError = "";

    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const connection = new Connection(rpcUrl, {
          commitment: "confirmed",
          confirmTransactionInitialTimeout: 12000,
        });

        // Verificar que la sub-wallet mantenga intacta la reserva obligatoria de gas (0.0035 SOL)
        // para que nunca se quede sin poder ejecutar swaps ni abrir cuentas WSOL/ATA
        const senderBal = await connection.getBalance(keypair.publicKey);
        const ESSENTIAL_GAS_RESERVE_LAMPORTS = 3500000; // 0.0035 SOL estricto para WSOL / ATA / gas
        if (senderBal < totalLamportsToSend + ESSENTIAL_GAS_RESERVE_LAMPORTS) {
          setPendingCreatorFeeLamports(totalLamportsToSend);
          return {
            success: true,
            isPendingAccumulated: true,
            accumulatedSol: totalLamportsToSend / LAMPORTS_PER_SOL,
            error: `Comisión de ${(totalLamportsToSend / LAMPORTS_PER_SOL).toFixed(6)} SOL retenida en cola local. Se preserva el saldo mínimo de 0.0035 SOL para gas y apertura de cuentas de tokens en los swaps. Se enviará on-chain cuando haya excedente de SOL.`,
          };
        }

        const { blockhash } = await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: destPubkey,
            lamports: totalLamportsToSend,
          })
        );

        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);

        const rawTx = tx.serialize();
        txHash = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
        });

        if (txHash) {
          await connection.confirmTransaction(txHash, "confirmed");
          setPendingCreatorFeeLamports(0);
          console.log(`[FeeCollector] Comisión de ${totalLamportsToSend / LAMPORTS_PER_SOL} SOL enviada y confirmada a ${cleanAddress}. Tx: ${txHash}`);
          break;
        }
      } catch (err: any) {
        lastError = err?.message || "Error RPC";
        console.warn(`[FeeCollector] Falló envío con ${rpcUrl}:`, lastError);
      }
    }

    if (!txHash) {
      setPendingCreatorFeeLamports(totalLamportsToSend);
      return {
        success: false,
        error: `No se pudo transferir comisión a través de nodos RPC: ${lastError}`,
        isPendingAccumulated: true,
        accumulatedSol: totalLamportsToSend / LAMPORTS_PER_SOL,
      };
    }

    return { success: true, txHash };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al transferir comisión al creador." };
  }
}

/**
 * Ejecuta un swap autónomo en Jupiter DEX con comisiones de plataforma
 */
export interface AutonomousSwapParams {
  fromSymbol: CryptoSymbol;
  toSymbol: CryptoSymbol;
  amount: number;
  sourceUsdPrice: number;
  targetUsdPrice: number;
  secretKeyBase58: string;
  isLiveOnChain: boolean;
  platformFeeBps: number; // Puntos básicos (ej. 15 = 0.15%)
  feeCollectorAddress: string;
  exactRawAmount?: string; // Cantidad cruda exacta para tokens SPL (evita error 6024)
  solPriceUsd?: number; // Precio de SOL en USD para calcular fee en SOL cuando se intercambian tokens SPL
}

export interface AutonomousSwapResult {
  success: boolean;
  txHash: string;
  solscanUrl: string;
  inputAmount: number;
  outputAmount: number;
  platformFeeAmount: number;
  platformFeeUsd: number;
  netGainUsd: number;
  errorMessage?: string;
  isRealOnChain: boolean;
  feeTxHash?: string;
  feeErrorMessage?: string;
}

export async function executeAutonomousSwap(
  params: AutonomousSwapParams
): Promise<AutonomousSwapResult> {
  const {
    fromSymbol,
    toSymbol,
    amount,
    sourceUsdPrice,
    targetUsdPrice,
    secretKeyBase58,
    isLiveOnChain,
    exactRawAmount,
  } = params;

  // Garantizar protección inmutable: La wallet de cobro y el fee están configurados en la sub-wallet
  const feeCollectorAddress = params.feeCollectorAddress || DEFAULT_FEE_COLLECTOR;
  const platformFeeBps = params.platformFeeBps !== undefined ? params.platformFeeBps : 15; // 0.15% transferido a tu wallet (15 bps)

  const fromInfo = JUPITER_TOKEN_MINTS[fromSymbol];
  const toInfo = JUPITER_TOKEN_MINTS[toSymbol];

  const totalUsdValue = amount * sourceUsdPrice;
  const feePercent = platformFeeBps / 10000;
  const platformFeeUsd = totalUsdValue * feePercent;
  const netUsdValue = totalUsdValue - platformFeeUsd;
  const estimatedOutputAmount = Number((netUsdValue / targetUsdPrice).toFixed(6));

  // Modo Real On-Chain con Jupiter DEX v1 API y firma automática
  try {
    const keypair = loadKeypairFromSecret(secretKeyBase58);
    if (!keypair) {
      throw new Error("Clave privada de sub-wallet inválida.");
    }

    const pubkey = keypair.publicKey;

    // 1. Verificar saldo real de SOL en la red mediante fetchSolBalance
    const realSolBal = await fetchSolBalance(pubkey.toBase58());
    const balanceLamports = Math.floor(realSolBal * LAMPORTS_PER_SOL);

    // Mínimo para cubrir tarifa de red básica (5,000 lamports = 0.000005 SOL) si se intercambia token SPL
    if (balanceLamports < 5000 && fromSymbol !== "SOL") {
      throw new Error(
        `Saldo insuficiente para tarifas de red en la sub-wallet (${pubkey.toBase58().substring(0, 4)}...${pubkey.toBase58().substring(pubkey.toBase58().length - 4)}). Tienes ${realSolBal.toFixed(5)} SOL. Se requiere al menos 0.000005 SOL para gas.`
      );
    }

    // Calcular inputLamports restando las tarifas directamente de la operación cuando se opera con SOL
    let inputLamports = 0;
    let actualOperatedAmount = amount;

    if (fromSymbol === "SOL") {
      // Restar los fees y costos del swap directamente del monto de la operación (trade) del usuario,
      // permitiendo que no requiera saldo adicional separado para completar el swap.
      // RESERVA CRÍTICA EN SOLANA:
      // Cuando se rota desde SOL hacia un token SPL (BTC, ETH, ZEC), Solana requiere:
      // 1. Renta de la Associated Token Account (ATA) exenta de renta: 0.00203928 SOL (fijada por el runtime de Solana).
      // 2. Tarifa base de red + Compute Budget / Prioridad de Jupiter: ~0.0001 a 0.0005 SOL.
      // 3. Tarifa de comisión de plataforma.
      // Por ende, una reserva mínima de 0.0035 SOL garantiza que la transacción NUNCA falle por 'insufficient lamports'.
      const feeInSol = amount * (platformFeeBps / 10000);
      const networkGasReserve = 0.0035;
      const requiredReserve = networkGasReserve + feeInSol;

      // Si el monto solicitado supera el balance real disponible menos la reserva de gas, descontar del monto
      let solToSwap = amount;
      if (solToSwap > realSolBal - requiredReserve) {
        solToSwap = Math.max(0.0001, realSolBal - requiredReserve);
      } else {
        solToSwap = Math.max(0.0001, solToSwap - feeInSol);
      }

      actualOperatedAmount = Number(solToSwap.toFixed(5));
      inputLamports = Math.floor(solToSwap * LAMPORTS_PER_SOL);

      if (inputLamports <= 0 || realSolBal < networkGasReserve) {
        throw new Error(
          `Saldo insuficiente en la sub-wallet (${realSolBal.toFixed(5)} SOL). Se requieren al menos ${networkGasReserve.toFixed(4)} SOL para creación de cuenta de token y tarifas de red en Solana.`
        );
      }
    } else {
      // Para tokens SPL (ZEC, BTC, ETH):
      // Usar la cantidad exacta disponible en la cuenta si existe para evitar 'custom program error: 6024' (overflow/insufficient funds)
      if (exactRawAmount && BigInt(exactRawAmount) > 0n) {
        inputLamports = Number(exactRawAmount);
      } else {
        inputLamports = Math.floor(amount * Math.pow(10, fromInfo.decimals));
      }

      if (inputLamports <= 0) {
        throw new Error("Monto a intercambiar demasiado pequeño para la precisión del token.");
      }
    }

    // 2. Obtener Quote de Jupiter probando endpoints públicos y mints compatibles
    let quoteData: any = null;
    let successfulBaseUrl = "";
    let lastQuoteError = "";

    const candidateInputMints = [fromInfo.mint, ...(ALTERNATIVE_TOKEN_MINTS[fromSymbol] || []).filter(m => m !== fromInfo.mint)];
    const candidateOutputMints = [toInfo.mint, ...(ALTERNATIVE_TOKEN_MINTS[toSymbol] || []).filter(m => m !== toInfo.mint)];

    for (const inMint of candidateInputMints) {
      for (const outMint of candidateOutputMints) {
        if (inMint === outMint) continue;

        for (const apiBase of JUPITER_API_BASES) {
          try {
            const quoteUrl = `${apiBase}/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${inputLamports}&slippageBps=100&restrictIntermediateTokens=false`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const res = await fetch(quoteUrl, {
              headers: { "Accept": "application/json" },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              if (data && (data.outAmount || data.outputMint || data.routePlan)) {
                quoteData = data;
                successfulBaseUrl = apiBase;
                break;
              }
            } else {
              const errBody = await res.text().catch(() => "");
              lastQuoteError = `HTTP ${res.status}: ${errBody || res.statusText}`;
            }
          } catch (e: any) {
            lastQuoteError = e?.message || "Error al conectar con Jupiter API";
          }
        }
        if (quoteData) break;
      }
      if (quoteData) break;
    }

    if (!quoteData) {
      let explanation = lastQuoteError;
      if (lastQuoteError.includes("TOKEN_NOT_TRADABLE")) {
        explanation = `El par ${fromSymbol} ➔ ${toSymbol} no cuenta con ruta de liquidez activa en Jupiter DEX en este momento. Prueba rotar hacia SOL, BTC o ETH.`;
      }
      throw new Error(
        `Jupiter DEX: No se encontró ruta de liquidez activa en Solana Mainnet para ${fromSymbol} ➔ ${toSymbol}. ${explanation}`
      );
    }

    // 3. Generar Swap Transaction con swap endpoint
    // NOTA TÉCNICA CRÍTICA: Si quoteResponse incluye platformFee sin una cuenta de token asociada pre-inicializada (feeAccount),
    // Jupiter Swap API arroja HTTP 400 'feeAccount is required for swap with platformFee'.
    // Eliminamos platformFee de quoteResponse para que Jupiter serialice el swap sin error,
    // cobrando la tarifa del creador on-chain de forma independiente y segura.
    const sanitizedQuoteResponse = {
      ...quoteData,
    };
    delete (sanitizedQuoteResponse as any).platformFee;

    const swapApiBase = successfulBaseUrl || "https://public.jupiterapi.com";
    let swapPayload: any = {
      quoteResponse: sanitizedQuoteResponse,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    };

    let swapRes: Response | null = null;
    try {
      swapRes = await fetch(`${swapApiBase}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(swapPayload),
        signal: AbortSignal.timeout(8000),
      });
    } catch {}

    // Si falló en la base actual, reintentar en endpoints alternativos
    if (!swapRes || !swapRes.ok) {
      const alternateBases = [
        "/api/jupiter",
        "https://public.jupiterapi.com",
        "https://api.jup.ag/swap/v1",
      ].filter(b => b !== swapApiBase);

      for (const altBase of alternateBases) {
        try {
          swapRes = await fetch(`${altBase}/swap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(swapPayload),
            signal: AbortSignal.timeout(8000),
          });
          if (swapRes && swapRes.ok) break;
        } catch {}
      }
    }

    if (!swapRes || !swapRes.ok) {
      const errText = swapRes ? await swapRes.text().catch(() => "") : "Sin respuesta del servidor DEX";
      throw new Error(`Jupiter Swap API error (${swapRes?.status || "500"}): ${errText || "Fallo al serializar transacción de swap"}`);
    }

    const { swapTransaction } = await swapRes.json();
    if (!swapTransaction) {
      throw new Error("No se recibió swapTransaction de Jupiter.");
    }

    // 4. Deserializar, firmar y simular en Solana
    const { VersionedTransaction } = await import("@solana/web3.js");
    const swapTransactionBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);

    // 4.1 Simulación previa obligatoria: Garantiza que no haya errores de contrato (ej. insufficient lamports o 6024)
    // antes de transmitir o cobrar comisiones.
    let simulationSuccess = false;
    let simulationError = "";

    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const connection = new Connection(rpcUrl, { commitment: "confirmed" });
        const sim = await connection.simulateTransaction(transaction);
        if (sim.value.err) {
          const errStr = JSON.stringify(sim.value.err);
          const logsStr = sim.value.logs?.slice(-3).join(" | ") || "";
          simulationError = `Simulación de Solana fallida (${errStr}). ${logsStr}`;
          simulationSuccess = false;
        } else {
          simulationSuccess = true;
          break;
        }
      } catch (simErr: any) {
        console.warn(`Simulación falló en ${rpcUrl}:`, simErr);
      }
    }

    if (!simulationSuccess && simulationError) {
      if (simulationError.includes("6024") || simulationError.includes("0x1788")) {
        throw new Error(
          `Saldo insuficiente del token ${fromSymbol} para ejecutar la operación en Jupiter DEX. El monto solicitado supera las tenencias reales en la wallet.`
        );
      }
      if (
        simulationError.toLowerCase().includes("insufficient lamports") ||
        simulationError.includes('"InsufficientFunds"') ||
        /insufficient.*lamports/i.test(simulationError)
      ) {
        throw new Error(
          "Saldo de SOL insuficiente para la transacción: Solana requiere reservar ~0.0035 SOL para cubrir la renta de la cuenta de token (ATA) y los costos de red."
        );
      }
      throw new Error(simulationError);
    }

    const rawTx = transaction.serialize();
    let txid = "";
    let broadcastError: any = null;
    let confirmedSuccess = false;
    let confirmationErrorMessage = "";

    // 4.2 Intentar broadcast y confirmación estricta on-chain a través de los RPCs resilientes
    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const connection = new Connection(rpcUrl, { commitment: "confirmed", confirmTransactionInitialTimeout: 30000 });

        txid = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
        });

        if (txid) {
          // Polling estricto de confirmación en la blockchain de Solana (hasta 30 segundos)
          // NUNCA asumir éxito si la transacción fue revertida o no confirmada
          const startTime = Date.now();
          while (Date.now() - startTime < 30000) {
            try {
              const statusRes = await connection.getSignatureStatus(txid, { searchTransactionHistory: true });
              const status = statusRes?.value;
              if (status) {
                if (status.err) {
                  const errDetails = JSON.stringify(status.err);
                  confirmationErrorMessage = `Error en contrato de Solana (${errDetails}). La transacción fue revertida en la blockchain.`;
                  confirmedSuccess = false;
                  break;
                }
                if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
                  confirmedSuccess = true;
                  break;
                }
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          if (confirmedSuccess) {
            break;
          } else if (confirmationErrorMessage) {
            throw new Error(confirmationErrorMessage);
          }
        }
      } catch (e: any) {
        broadcastError = e;
        if (e.message?.includes("Error en contrato") || e.message?.includes("revertida") || e.message?.includes("insufficient")) {
          throw e;
        }
        continue;
      }
    }

    if (!txid || !confirmedSuccess) {
      throw new Error(
        confirmationErrorMessage ||
        broadcastError?.message ||
        "No se pudo confirmar la transacción en la red Solana Mainnet. Por seguridad el swap no fue ejecutado."
      );
    }

    // 5. Transferir la comisión de plataforma on-chain a la wallet del creador
    let feeTxHash = "";
    let feeErrorMessage = "";

    if (platformFeeBps > 0 && feeCollectorAddress) {
      let feeInSol = 0;
      if (fromSymbol === "SOL") {
        feeInSol = Number((amount * (platformFeeBps / 10000)).toFixed(7));
      } else if (toSymbol === "SOL") {
        const outLamports = Number(quoteData.outAmount || 0);
        const outSol = outLamports / LAMPORTS_PER_SOL;
        feeInSol = Number((outSol * (platformFeeBps / 10000)).toFixed(7));
      } else {
        const solPrice = params.solPriceUsd || 105;
        feeInSol = Number((platformFeeUsd / solPrice).toFixed(7));
      }

      if (feeInSol > 0.000001) {
        try {
          const feeResult = await sendCreatorFeeOnChain({
            secretKeyBase58,
            creatorWalletAddress: feeCollectorAddress,
            feeInSol,
          });
          if (feeResult.success && feeResult.txHash) {
            feeTxHash = feeResult.txHash;
          } else if (feeResult.error) {
            feeErrorMessage = feeResult.error;
          } else if (feeResult.isPendingAccumulated) {
            feeErrorMessage = `Comisión de ${(feeInSol).toFixed(6)} SOL acumulada (${(feeResult.accumulatedSol || 0).toFixed(5)} SOL total). Pendiente de umbral de renta de Solana (~0.00089 SOL).`;
          }
        } catch (fErr: any) {
          feeErrorMessage = fErr?.message || "Error al enviar fee";
        }
      }
    }

    return {
      success: true,
      txHash: txid,
      solscanUrl: `https://solscan.io/tx/${txid}`,
      inputAmount: actualOperatedAmount,
      outputAmount: estimatedOutputAmount,
      platformFeeAmount: Number((platformFeeUsd / sourceUsdPrice).toFixed(6)),
      platformFeeUsd,
      netGainUsd: netUsdValue - totalUsdValue,
      isRealOnChain: true,
      feeTxHash,
      feeErrorMessage,
    };
  } catch (err: any) {
    console.warn("On-chain swap could not be completed on Solana mainnet:", err);
    return {
      success: false,
      txHash: "",
      solscanUrl: "",
      inputAmount: amount,
      outputAmount: estimatedOutputAmount,
      platformFeeAmount: Number((platformFeeUsd / sourceUsdPrice).toFixed(6)),
      platformFeeUsd,
      netGainUsd: 0,
      errorMessage: err?.message || "Error al ejecutar transacción en la red Solana Mainnet.",
      isRealOnChain: false,
    };
  }
}

/**
 * Retira SOL de la sub-wallet a la wallet principal del usuario
 */
export async function withdrawSolToMainWallet(
  secretKeyBase58: string,
  destinationAddress: string,
  amountSol: number,
  rpcUrl = DEFAULT_SOLANA_RPC
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const keypair = loadKeypairFromSecret(secretKeyBase58);
    if (!keypair) {
      return { success: false, error: "Clave privada del bot inválida." };
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const destPubkey = new PublicKey(destinationAddress);
    const lamportsToSend = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Dejar un mínimo para la tarifa de red (5000 lamports)
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destPubkey,
        lamports: lamportsToSend - 5000,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);

    const txid = await connection.sendRawTransaction(tx.serialize());
    return { success: true, txHash: txid };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al retirar fondos." };
  }
}

/**
 * Consulta cuentas de token vacías asociadas a una wallet que tienen lamports de renta bloqueados
 */
export async function checkEmptyTokenAccounts(
  address: string
): Promise<{ count: number; reclaimableLamports: number; reclaimableSol: number; accounts: string[] }> {
  if (!address || address.length < 32) {
    return { count: 0, reclaimableLamports: 0, reclaimableSol: 0, accounts: [] };
  }

  // Intentar primero con backend rápido
  try {
    const res = await fetch(`/api/wallet/empty-accounts/${address}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        count: data.emptyAccountsCount || 0,
        reclaimableLamports: data.reclaimableLamports || 0,
        reclaimableSol: data.reclaimableSol || 0,
        accounts: (data.emptyAccounts || []).map((a: any) => a.pubkey),
      };
    }
  } catch {}

  // Fallback con conexión directa RPC
  try {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    for (const rpc of FALLBACK_SOLANA_RPCS) {
      try {
        const conn = new Connection(rpc, "confirmed");
        const resp = await conn.getParsedTokenAccountsByOwner(new PublicKey(address), {
          programId: TOKEN_PROGRAM_ID,
        });

        let count = 0;
        let reclaimableLamports = 0;
        const accounts: string[] = [];

        for (const item of resp.value) {
          const amount = item.account.data.parsed?.info?.tokenAmount?.amount;
          if (amount === "0" || amount === 0) {
            count++;
            reclaimableLamports += item.account.lamports;
            accounts.push(item.pubkey.toBase58());
          }
        }

        return {
          count,
          reclaimableLamports,
          reclaimableSol: reclaimableLamports / LAMPORTS_PER_SOL,
          accounts,
        };
      } catch {}
    }
  } catch {}

  return { count: 0, reclaimableLamports: 0, reclaimableSol: 0, accounts: [] };
}

/**
 * Cierra automáticamente todas las cuentas de tokens con saldo 0 para recuperar su renta de Solana
 * y transferirla inmediatamente a la sub-wallet como saldo de SOL para gas y swaps.
 */
export async function reclaimRentFromEmptyAccounts(secretKeyBase58: string): Promise<{
  success: boolean;
  reclaimedLamports: number;
  reclaimedSol: number;
  txHash?: string;
  error?: string;
}> {
  try {
    const keypair = loadKeypairFromSecret(secretKeyBase58);
    if (!keypair) {
      return { success: false, reclaimedLamports: 0, reclaimedSol: 0, error: "Keypair inválido." };
    }

    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    let accountsToClose: { pubkey: PublicKey; lamports: number }[] = [];

    // Obtener cuentas vacías
    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const conn = new Connection(rpcUrl, "confirmed");
        const resp = await conn.getParsedTokenAccountsByOwner(keypair.publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        accountsToClose = [];
        for (const item of resp.value) {
          const amount = item.account.data.parsed?.info?.tokenAmount?.amount;
          if (amount === "0" || amount === 0) {
            accountsToClose.push({
              pubkey: item.pubkey,
              lamports: item.account.lamports,
            });
          }
        }
        if (accountsToClose.length > 0 || resp.value.length === 0) {
          break;
        }
      } catch (e) {
        console.warn(`[ReclaimRent] Error en ${rpcUrl}:`, e);
      }
    }

    if (accountsToClose.length === 0) {
      return { success: true, reclaimedLamports: 0, reclaimedSol: 0 };
    }

    let totalLamports = 0;
    const instructions: TransactionInstruction[] = [];

    for (const acc of accountsToClose) {
      totalLamports += acc.lamports;
      // Instrucción 9 de SPL Token: CloseAccount
      instructions.push(
        new TransactionInstruction({
          keys: [
            { pubkey: acc.pubkey, isSigner: false, isWritable: true },
            { pubkey: keypair.publicKey, isSigner: false, isWritable: true },
            { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
          ],
          programId: TOKEN_PROGRAM_ID,
          data: Buffer.from([9]),
        })
      );
    }

    let txHash = "";
    for (const rpcUrl of FALLBACK_SOLANA_RPCS) {
      try {
        const conn = new Connection(rpcUrl, "confirmed");
        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        const tx = new Transaction().add(...instructions);
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);

        const raw = tx.serialize();
        txHash = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
        if (txHash) {
          await conn.confirmTransaction(txHash, "confirmed");
          console.log(`[ReclaimRent] Recuperados ${totalLamports / LAMPORTS_PER_SOL} SOL. Tx: ${txHash}`);
          break;
        }
      } catch (err: any) {
        console.warn(`[ReclaimRent] Falló envío en ${rpcUrl}:`, err?.message);
      }
    }

    if (!txHash) {
      return {
        success: false,
        reclaimedLamports: 0,
        reclaimedSol: 0,
        error: "No se pudo transmitir la transacción de recuperación a la red Solana.",
      };
    }

    return {
      success: true,
      reclaimedLamports: totalLamports,
      reclaimedSol: totalLamports / LAMPORTS_PER_SOL,
      txHash,
    };
  } catch (err: any) {
    return {
      success: false,
      reclaimedLamports: 0,
      reclaimedSol: 0,
      error: err?.message || "Error al recuperar renta.",
    };
  }
}

