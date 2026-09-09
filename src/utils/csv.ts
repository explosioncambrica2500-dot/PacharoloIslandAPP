import { DexTransaction } from "../types";

/**
 * Converts DEX transactions to CSV and triggers browser download.
 */
export function exportTransactionsToCSV(
  transactions: DexTransaction[],
  filenamePrefix = "jupiter_bot_operaciones"
) {
  if (!transactions || transactions.length === 0) {
    alert("No hay transacciones disponibles para exportar.");
    return false;
  }

  const headers = [
    "ID Transacción",
    "Fecha y Hora (ISO)",
    "Fecha Local",
    "Token Origen",
    "Operación",
    "Precio USD",
    "Cantidad Origen",
    "Token Destino",
    "Cantidad Destino",
    "Diferencial Spread %",
    "Total USD",
    "Hash Transacción",
    "Billetera",
    "DEX",
    "Estado",
  ];

  const rows = transactions.map((tx) => [
    tx.id,
    tx.timestamp,
    new Date(tx.timestamp).toLocaleString("es-ES"),
    tx.symbol,
    tx.type,
    tx.priceUsd.toFixed(tx.priceUsd > 100 ? 2 : 4),
    tx.amount.toString(),
    tx.toSymbol || "N/A",
    tx.toAmount ? tx.toAmount.toString() : "N/A",
    tx.spreadPercent !== undefined ? `${tx.spreadPercent.toFixed(2)}%` : "N/A",
    tx.totalUsd.toFixed(2),
    `"${tx.txHash}"`,
    `"${tx.wallet}"`,
    `"${tx.dex}"`,
    tx.status,
  ]);

  const csvContent =
    "\uFEFF" + // UTF-8 BOM for Excel
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filenamePrefix}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
