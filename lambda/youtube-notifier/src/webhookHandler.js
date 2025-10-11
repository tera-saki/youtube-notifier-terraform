const { DateTime } = require('luxon')
const { XMLParser } = require('fast-xml-parser')

const DynamoDBHelper = require('./DynamoDBHelper')
const YoutubeNotifier = require('./YouTubeNotifier')
const {
  credentialsPath,
  tokenPath,
  config,
  DYNAMODB_TABLE_NAME,
} = require('./constants')
const { generateResponse } = require('./utils')

const notifier = new YoutubeNotifier({
  credentialsPath,
  tokenPath,
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

function validateLink(link) {
  if (typeof link !== 'string') {
    return false
  }
  const regex = /^https:\/\/www\.youtube\.com\//
  return regex.test(link)
}

function parseXML(xmlString) {
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xmlString)
    const entry = parsed.feed.entry
    const channelId = entry['yt:channelId']
    const link = entry.link['@_href']
    const updatedAt = entry.updated

    if (!validateChannelId(channelId)) {
      throw new Error('Invalid channel ID')
    }
    if (!validateLink(link)) {
      throw new Error('Invalid video link')
    }
    if (!DateTime.fromISO(updatedAt).isValid) {
      throw new Error('Invalid updated time')
    }
    return { channelId, link, updatedAt }
  } catch (e) {
    console.warn('Error parsing XML:', e)
    return null
  }
}

async function handleGet({ params }) {
  const mode = params['hub.mode']
  const topic = params['hub.topic']
  const challenge = params['hub.challenge']
  const lease_seconds = params['hub.lease_seconds']

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

  if (mode === 'subscribe') {
    if (!lease_seconds || Number.isNaN(Number.parseInt(lease_seconds, 10))) {
      return generateResponse(400, 'Invalid hub.lease_seconds parameter')
    }
    const subscriptionExpiredAt = DateTime.now()
      .plus({ seconds: Number.parseInt(lease_seconds, 10) })
      .toISO()

    await DynamoDBHelper.updateItem(
      DYNAMODB_TABLE_NAME,
      {
        channelId: params.channel_id,
      },
      {
        subscriptionExpiredAt,
      },
    )
  } else {
    await DynamoDBHelper.deleteItem(DYNAMODB_TABLE_NAME, {
      channelId: params.channel_id,
    })
  }
  return generateResponse(200, challenge)
}

// TODO: validation
async function handlePost({ params, body }) {
  console.log('POST Notification received')
  console.log('Params:', params)
  console.log('Body:', body)

  const parsed = parseXML(body)
  if (!parsed) {
    return generateResponse(400, 'Invalid XML body')
  }
  const { channelId, link, updatedAt } = parsed

  if (config.exclude_shorts && link.match('https://www.youtube.com/shorts/')) {
    console.log('Excluded shorts video:', link)
  } else {
    const channelStatus = await DynamoDBHelper.getItem(DYNAMODB_TABLE_NAME, {
      channelId,
    })
    const start = channelStatus?.lastUpdatedAt
      ? DateTime.fromISO(channelStatus.lastUpdatedAt)
          .plus({ seconds: 1 })
          .toISO()
      : DateTime.now().minus({ days: 1 }).toISO()
    await notifier.run(channelId, start)
  }

  await DynamoDBHelper.updateItem(
    DYNAMODB_TABLE_NAME,
    { channelId },
    { lastUpdatedAt: updatedAt },
  )

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
