const { DateTime } = require('luxon')

const DynamoDBHelper = require('./DynamoDBHelper')
const YoutubeNotifier = require('./YouTubeNotifier')
const {
  credentialsPath,
  tokenPath,
  configPath,
  DYNAMODB_TABLE_NAME,
} = require('./constants')
const { generateResponse } = require('./utils')

const notifier = new YoutubeNotifier({
  credentialsPath,
  tokenPath,
  configPath,
})

function validateChannelId(channelId) {
  if (typeof channelId !== 'string') {
    return false
  }
  const regex = /^[a-zA-Z0-9\-_]{24}$/
  return regex.test(channelId)
}

function validateTopic(topic) {
  if (typeof topic !== 'string') {
    return false
  }
  const regex =
    /^https:\/\/www\.youtube\.com\/xml\/feeds\/videos\.xml\?channel_id=[a-zA-Z0-9\-_]{24}$/
  return regex.test(topic)
}

async function handleGet({ params }) {
  const mode = params['hub.mode']
  const topic = params['hub.topic']
  const challenge = params['hub.challenge']

  if (!['subscribe', 'unsubscribe'].includes(mode)) {
    return generateResponse(400, 'Invalid hub.mode parameter')
  }
  if (!validateTopic(topic)) {
    return generateResponse(400, 'Invalid hub.topic parameter')
  }
  if (!challenge) {
    return generateResponse(400, 'Missing hub.challenge parameter')
  }

  console.log('GET Verification:', { mode, topic })

  if (mode == 'subscribe') {
    await DynamoDBHelper.updateItem(
      DYNAMODB_TABLE_NAME,
      {
        channelId: params.channel_id,
      },
      {
        subscriptionExpiredAt: DateTime.now().plus({ days: 10 }).toISO(),
      },
    )
  }
  return generateResponse(200, challenge)
}

// TODO: validation
async function handlePost({ params, body }) {
  console.log('POST Notification received')
  console.log('Params:', params)
  console.log('Body:', body)

  const channelId = params.channel_id
  if (!channelId) {
    return generateResponse(400, 'Missing channel_id parameter')
  }
  if (!validateChannelId(channelId)) {
    return generateResponse(400, 'Invalid channel_id parameter')
  }

  await notifier.run(channelId)

  return generateResponse(204)
}

async function handleWebhook(event) {
  const {
    queryStringParameters: params,
    requestContext,
    body: requestBody,
  } = event

  const method = requestContext.http.method

  let response
  if (method === 'GET') {
    response = handleGet({ params })
  } else if (method === 'POST') {
    response = handlePost({ params, body: requestBody })
  } else {
    throw new Error(`Unsupported HTTP method: ${method}`)
  }

  const { statusCode, body: responseBody } = await response
  return {
    statusCode,
    body: responseBody,
  }
}

module.exports = handleWebhook
