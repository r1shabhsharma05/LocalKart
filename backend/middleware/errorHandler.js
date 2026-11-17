// One error-handling middleware for the whole API. Client errors keep
// their message; server errors return a generic message — a stack trace
// or internal detail must never reach the client.
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  const status = Number(err.status || err.statusCode);
  const isClientError = status >= 400 && status < 500;
  const isUploadError = err.name === 'MulterError';
  // Body-parser failures carry no status, but they are client errors too.
  const isBadJson = err.type === 'entity.parse.failed';
  const responseStatus = isClientError || isUploadError || isBadJson ? 400 : 500;
  const message = responseStatus === 400
    ? (isBadJson ? 'Invalid JSON request body' : err.message || 'Invalid request data')
    : 'Something went wrong';

  res.status(responseStatus).json({ message });
};

module.exports = errorHandler;
