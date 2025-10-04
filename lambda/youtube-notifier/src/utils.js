function generateResponse(statusCode, body = undefined) {
  return {
    statusCode,
    body,
  }
}

module.exports = { generateResponse }
