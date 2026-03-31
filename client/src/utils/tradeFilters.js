const matchesTypedFilter = (value, filterValue) => {
  if (!filterValue) {
    return true;
  }
  return String(value || "")
    .toLowerCase()
    .includes(String(filterValue).toLowerCase());
};

export const matchesTradeFilters = (trade, filters) => {
  if (filters.profileId && String(trade.profileId || "") !== String(filters.profileId)) {
    return false;
  }
  if (!matchesTypedFilter(trade.pair, filters.pair)) {
    return false;
  }
  if (!matchesTypedFilter(trade.session, filters.session)) {
    return false;
  }
  if (!matchesTypedFilter(trade.setupType, filters.setupType)) {
    return false;
  }
  if (filters.cleanOnly && !trade.tags?.cleanSetup) {
    return false;
  }
  return true;
};

export const formatSyncTime = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
