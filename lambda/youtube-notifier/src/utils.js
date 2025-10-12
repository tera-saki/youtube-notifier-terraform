const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm')

const { HUB_SECRET_NAME } = require('./constants')

async function getHubSecret() {
  const ssm = new SSMClient()
  const command = new GetParameterCommand({
    Name: HUB_SECRET_NAME,
    WithDecryption: true,
  })
  const response = await ssm.send(command)
  return response.Parameter.Value
}

function generateResponse(statusCode, body = undefined) {
  return {
    statusCode,
    body,
  }
}

module.exports = { getHubSecret, generateResponse }
