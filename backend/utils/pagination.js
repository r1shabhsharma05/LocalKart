// Shared pagination parsing: one place clamps page/limit so no route
// can be driven to skip(-1) or a 10,000-row response by a query string.
const parsePagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { parsePagination };
