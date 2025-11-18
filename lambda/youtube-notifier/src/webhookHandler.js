const crypto = require('node:crypto')

const { DateTime } = require('luxon')
const { XMLParser } = require('fast-xml-parser')

const DynamoDBHelper = require('./DynamoDBHelper')
const YoutubeNotifier = require('./YouTubeNotifier')
const {
  credentialsPath,
  tokenPath,
  config,
  DYNAMODB_CHANNEL_STATUS_TABLE_NAME,
} = require('./constants')
const { getHubSecret, generateResponse } = require('./utils')

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

function validateSignature(payload, signature, secret) {
  if (!signature || !signature.startsWith('sha1=')) {
    console.warn('Invalid signature format')
    return false
  }

  const receivedSignature = signature.substring(5)
  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(payload, 'utf8')
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    )
  } catch (e) {
    console.warn('Signature validation error:', e)
    return false
  }
}

function parseXML(xmlString) {
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xmlString)
    const feed = parsed.feed
    if (feed['at:deleted-entry']) {
      console.log('ignore deleted entry')
      return [true, null]
    }
    const entry = feed.entry
    const videoId = entry['yt:videoId']
    const link = Array.isArray(entry.link)
      ? entry.link[0]['@_href']
      : entry.link['@_href']

    if (!validateLink(link)) {
      throw new Error('Invalid video link')
    }
    return [true, { videoId, link }]
  } catch (e) {
    console.warn('Error parsing XML:', e)
    return [false, null]
  }
}

async function updateChannelStatus(channelId, props) {
  await DynamoDBHelper.updateItem(
    DYNAMODB_CHANNEL_STATUS_TABLE_NAME,
    { channelId },
    props,
  )
}

async function deleteChannelStatus(channelId) {
  await DynamoDBHelper.deleteItem(DYNAMODB_CHANNEL_STATUS_TABLE_NAME, {
    channelId,
  })
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
    await updateChannelStatus(params.channel_id, { subscriptionExpiredAt })
    console.log(`Subscribed to channel ${params.channel_id}`)
  } else {
    await deleteChannelStatus(params.channel_id)
    console.log(`Unsubscribed from channel ${params.channel_id}`)
  }
  return generateResponse(200, challenge)
}

async function handlePost({ params, body, headers }) {
  console.log('POST Notification received')
  console.log('Params:', params)
  console.log('Body:', body)

  const signature = headers['x-hub-signature']
  const hubSecret = await getHubSecret()
  if (!validateSignature(body, signature, hubSecret)) {
    console.warn('Invalid signature')
    return generateResponse(200)
  }
  console.log('Signature validated')

  const [succeeded, xml] = parseXML(body)
  if (!succeeded) {
    return generateResponse(400, 'Invalid XML body')
  }
  if (!xml) {
    return generateResponse(200)
  }
  const { videoId, link } = xml

  if (config.exclude_shorts && link.match('https://www.youtube.com/shorts/')) {
    console.log('Excluded shorts video:', link)
    return generateResponse(200)
  }

  await new YoutubeNotifier({
    credentialsPath,
    tokenPath,
  }).run(videoId)
  return generateResponse(200)
}

async function handleWebhook(event) {
  const {
    headers,
    queryStringParameters: params,
    requestContext,
    body: requestBody,
  } = event

  const method = requestContext.http.method

  let response
  if (method === 'GET') {
    response = handleGet({ params })
  } else if (method === 'POST') {
    response = handlePost({ headers, params, body: requestBody })
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
