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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function subscribe(channelId) {
  return axios.post(
    hubUrl,
    {
      'hub.mode': 'subscribe',
      'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
      'hub.callback': `${APIGATEWAY_ENDPOINT}/callback?channel_id=${channelId}`,
      'hub.lease_seconds': 864000, // 10 days
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
}

function unsubscribe(channelId) {
  return axios.post(
    hubUrl,
    {
      'hub.mode': 'unsubscribe',
      'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
      'hub.callback': `${APIGATEWAY_ENDPOINT}/callback?channel_id=${channelId}`,
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
}

// Processes channels in the following priority order:
// 1. Newly subscribed channels that need initial webhook setup
// 2. Channels with subscriptions about to expire that need renewal
// 3. Channels that have been unsubscribed and need webhook removal
async function getProcessedChannelIds() {
  const subscribedChannels = await youtubeFetcher.getSubscribedChannels()
  const watchedChannels = await DynamoDBHelper.listItems(DYNAMODB_TABLE_NAME)

  const subscribedChannelIds = new Set(
    subscribedChannels.map((c) => c.channelId),
  )
  const watchedChannelIds = new Set(watchedChannels.map((c) => c.channelId))

  const newSubscribedChannelIds =
    subscribedChannelIds.difference(watchedChannelIds)
  const unsubscribedChannelIds =
    watchedChannelIds.difference(subscribedChannelIds)
  const toBeExpiredChannelIds = watchedChannels
    .filter(
      (c) =>
        DateTime.fromISO(c.subscriptionExpiredAt) - DateTime.now() <
        Duration.fromObject({ days: 3 }),
    )
    .map((c) => c.channelId)
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

  try {
    for (const channelId of newSubscribedChannelIds) {
      console.log(`New subscribed channel found: ${channelId}`)
      await subscribe(channelId)
      console.log(`Channel subscription requested: ${channelId}`)
      await sleep(3000)
    }
    for (const channelId of toBeExpiredChannelIds) {
      console.log(`Channel subscription is about to expire: ${channelId}`)
      await subscribe(channelId)
      console.log(`Channel subscription renewal requested: ${channelId}`)
      await sleep(3000)
    }
    for (const channelId of unsubscribedChannelIds) {
      console.log(`Channel unsubscribed: ${channelId}`)
      await unsubscribe(channelId)
      console.log(`Channel unsubscription requested: ${channelId}`)
      await sleep(3000)
    }
  } catch (e) {
    if (e instanceof axios.AxiosError && e.status == 429) {
      console.log('Throttled, wait for next invocation')
      return generateResponse(200)
    }
    throw e
  }

  return generateResponse(200)
}

module.exports = handleSchedule
