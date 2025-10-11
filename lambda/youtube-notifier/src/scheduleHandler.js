const axios = require('axios')
const { DateTime, Duration } = require('luxon')

const DynamoDBHelper = require('./DynamoDBHelper')
const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')
const {
  credentialsPath,
  tokenPath,
  APIGATEWAY_ENDPOINT,
  DYNAMODB_TABLE_NAME,
} = require('./constants')
const { generateResponse } = require('./utils')

const youtubeFetcher = new YouTubeChannelFetcher({ credentialsPath, tokenPath })

const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe'

function sleepWithExponentialBackoff(
  attempt,
  baseDelayMs = 3000,
  maxDelayMs = 30000,
) {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function subscribe(channelId) {
  await axios.post(
    hubUrl,
    {
      'hub.mode': 'subscribe',
      'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
      'hub.callback': `${APIGATEWAY_ENDPOINT}/callback?channel_id=${channelId}`,
      'hub.lease_seconds': 864000, // 10 days
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  console.log(`Send subscription request for channel ${channelId}`)
}

async function unsubscribe(channelId) {
  await axios.post(
    hubUrl,
    {
      'hub.mode': 'unsubscribe',
      'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
      'hub.callback': `${APIGATEWAY_ENDPOINT}/callback?channel_id=${channelId}`,
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  console.log(`Send unsubscription request for channel ${channelId}`)
}

// Processes channels in the following priority order:
// 1. Newly subscribed channels that need initial webhook setup
// 2. Channels with subscriptions about to expire that need renewal
// 3. Channels that have been unsubscribed and need webhook removal
async function getProcessedChannelIds() {
  const subscribedChannels = await youtubeFetcher.getSubscribedChannels()
  const watchedChannels = await DynamoDBHelper.listItems(DYNAMODB_TABLE_NAME)

  const subscriptionExpiredAt = Object.fromEntries(
    watchedChannels.map((c) => [c.channelId, c.subscriptionExpiredAt]),
  )

  const subscribedChannelIds = new Set(
    subscribedChannels.map((c) => c.channelId),
  )
  const watchedChannelIds = new Set(watchedChannels.map((c) => c.channelId))

  const newSubscribedChannelIds = Array.from(
    subscribedChannelIds.difference(watchedChannelIds),
  )
  const unsubscribedChannelIds = Array.from(
    watchedChannelIds.difference(subscribedChannelIds),
  )
  const toBeExpiredChannelIds = Array.from(
    subscribedChannelIds.intersection(watchedChannelIds),
  ).filter(
    (id) =>
      DateTime.fromISO(subscriptionExpiredAt[id]) - DateTime.now() <
      Duration.fromObject({ days: 3 }),
  )
  return {
    newSubscribedChannelIds,
    unsubscribedChannelIds,
    toBeExpiredChannelIds,
  }
}

async function handleSchedule() {
  const {
    newSubscribedChannelIds,
    unsubscribedChannelIds,
    toBeExpiredChannelIds,
  } = await getProcessedChannelIds()

  const tasks = [
    [...newSubscribedChannelIds, ...toBeExpiredChannelIds].map((id) => [
      subscribe,
      id,
    ]),
    unsubscribedChannelIds.map((id) => [unsubscribe, id]),
  ].flat()

  const maxAttempts = 3
  for (const [func, ...args] of tasks) {
    let attempt = 0
    let succeeded = false
    while (!succeeded) {
      try {
        await func(...args)
        succeeded = true
      } catch (e) {
        if (e instanceof axios.AxiosError && e.status == 429) {
          if (++attempt === maxAttempts) {
            console.log('Max attempts reached. Wait for next schedule.')
            return generateResponse(200)
          }
          console.log(`Throttled, retrying... (attempts: ${attempt})`)
        } else {
          throw e
        }
      } finally {
        await sleepWithExponentialBackoff(attempt)
      }
    }
  }

  return generateResponse(200)
}

module.exports = handleSchedule
