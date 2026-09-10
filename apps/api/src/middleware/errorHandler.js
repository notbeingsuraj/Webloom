export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Log server-side only
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);

  // Categorize errors for the frontend
  let category = 'INTERNAL_SERVER_FAILURE';
  let safeMessage = 'An unexpected error occurred while processing your request.';

  if (statusCode === 400) {
    category = 'USER_INPUT_ERROR';
    safeMessage = err.message || 'Invalid request.';
  } else if (statusCode === 404) {
    category = 'NOT_FOUND';
    safeMessage = 'The requested resource was not found.';
  } else if (statusCode === 408 || err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
    category = 'TIMEOUT';
    safeMessage = 'The request took too long to complete. Please try again.';
    if (statusCode === 200) {
      return res.status(408).json({
        error: 'request_timeout',
        message: safeMessage,
        category,
      });
    }
  } else if (statusCode === 429) {
    category = 'RATE_LIMITED';
    safeMessage = 'Too many requests. Please wait a moment and try again.';
  } else if (statusCode === 503) {
    category = 'PROVIDER_UNAVAILABLE';
    safeMessage = err.message || 'A required service is temporarily unavailable.';
  }

  // Never expose stack traces or internal details to the client
  res.status(statusCode).json({
    error: err.error || 'server_error',
    message: safeMessage,
    category,
  });
};

export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
