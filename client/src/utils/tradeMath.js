export const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const calculatePlannedRR = ({ entryPrice, stopLoss, takeProfit }) => {
  const risk = Math.abs(Number(entryPrice) - Number(stopLoss));
  const reward = Math.abs(Number(takeProfit) - Number(entryPrice));

  if (!risk || !Number.isFinite(risk)) {
    return 0;
  }

  return round(reward / risk);
};

export const calculateAchievedRR = (plannedRR, result) => {
  if (result === "Win") {
    return plannedRR;
  }
  if (result === "Loss") {
    return -1;
  }
  return 0;
};

export const calculateLotSize = ({
  accountBalance,
  riskPercent,
  entryPrice,
  stopLoss,
  pair,
  pipValuePerLot = 10,
}) => {
  const balance = Number(accountBalance);
  const risk = Number(riskPercent);
  const entry = Number(entryPrice);
  const stop = Number(stopLoss);

  if (!balance || !risk || !entry || !stop) {
    return 0;
  }

  const pipMultiplier = String(pair || "").toUpperCase().endsWith("JPY") ? 100 : 10000;
  const stopPips = Math.abs(entry - stop) * pipMultiplier;
  if (!stopPips) {
    return 0;
  }

  const riskAmount = (balance * risk) / 100;
  const lots = riskAmount / (stopPips * pipValuePerLot);
  return round(lots, 2);
};
