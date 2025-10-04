const YoutubeNotifier = require('./YouTubeNotifier')

const { credentialsPath, tokenPath, configPath } = require('./constants')

const notifier = new YoutubeNotifier({
  credentialsPath,
  tokenPath,
  configPath,
})

function validateChannelId(channelId) {
  if (!typeof channelId !== 'string') {
    return false
  }
  const regex = /^[a-zA-Z0-9\-_]{24}$/
  return regex.test(channelId)
}

function handleGet({ params }) {
  const mode = params['hub.mode']
  const topic = params['hub.topic']
  const challenge = params['hub.challenge']

  console.log('GET Verification:', { mode, topic })

  if (mode === 'subscribe' || mode === 'unsubscribe') {
    return {
      statusCode: 200,
      body: challenge,
    }
  }
  return {
    statusCode: 400,
    body: 'Invalid request',
  }
}

// TODO: validation
async function handlePost({ params, body }) {
  console.log('POST Notification received')
  console.log('Params:', params)
  console.log('Body:', body)

  const channelId = params.channel_id
  if (!channelId) {
    return {
      statusCode: 400,
      body: 'Missing channel_id parameter',
    }
  }
  if (!validateChannelId(channelId)) {
    return {
      statusCode: 400,
      body: 'Invalid channelId parameter',
    }
  }

  await notifier.run(channelId)

  return {
    statusCode: 204,
  }
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
