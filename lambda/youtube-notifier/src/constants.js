const path = require('node:path')

const rootDir = path.join(__dirname, '..')
const credentialsPath = path.join(rootDir, 'credentials', 'credentials.json')
const tokenPath = path.join(rootDir, 'credentials', 'token.json')
const configPath = path.join(rootDir, 'config', 'config.json')

// environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME
if (!DYNAMODB_TABLE_NAME) {
  throw new Error('DYNAMODB_TABLE_NAME environment variable is not set')
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
if (!SLACK_WEBHOOK_URL) {
  throw new Error('SLACK_WEBHOOK_URL environment variable is not set')
}

const APIGATEWAY_ENDPOINT = process.env.APIGATEWAY_ENDPOINT
if (!APIGATEWAY_ENDPOINT) {
  throw new Error('APIGATEWAY_ENDPOINT environment variable is not set')
}

module.exports = {
  credentialsPath,
  tokenPath,
  configPath,
  DYNAMODB_TABLE_NAME,
  SLACK_WEBHOOK_URL,
  APIGATEWAY_ENDPOINT,
}
