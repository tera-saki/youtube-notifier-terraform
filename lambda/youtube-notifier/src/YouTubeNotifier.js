const fs = require('node:fs')

const axios = require('axios')
const { DateTime } = require('luxon')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require('@aws-sdk/lib-dynamodb')

const { DYNAMODB_TABLE_NAME, SLACK_WEBHOOK_URL } = require('./constants')

const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')

class YouTubeNotifier {
  constructor({ credentialsPath, tokenPath, configPath }) {
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credential file not found: ${credentialsPath}`)
    }
    if (!fs.existsSync(tokenPath)) {
      throw new Error(`Token file not found: ${tokenPath}`)
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`)
    }

    this.youtubeFetcher = new YouTubeChannelFetcher({
      credentialsPath,
      tokenPath,
    })
    this.config = JSON.parse(fs.readFileSync(configPath, { encoding: 'utf-8' }))

    const client = new DynamoDBClient({})
    this.docClient = DynamoDBDocumentClient.from(client)
    this.dynamoTable = DYNAMODB_TABLE_NAME

    this.slack_webhook_url = SLACK_WEBHOOK_URL
  }

  async getChannelStatus(channelId) {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.dynamoTable,
        Key: { channelId },
      }),
    )
    return res.Item
  }

  async putChannelStatus(channelId, status) {
    await this.docClient.send(
      new PutCommand({
        TableName: this.dynamoTable,
        Item: { channelId, ...status },
      }),
    )
  }

  validateVideo(video) {
    const exclude_words = this.config.exclude_words ?? []
    return exclude_words.every((w) => !video.title.match(w))
  }

  async notify(video) {
    const videoURL = `https://www.youtube.com/watch?v=${video.videoId}`
    let text
    if (video.liveBroadcastContent === 'upcoming') {
      const localeString = DateTime.fromISO(
        video.liveStreamingDetails.scheduledStartTime,
      ).toLocaleString(DateTime.DATETIME_SHORT, { locale: 'ja' })
      text = `:alarm_clock: ${video.channelTitle} plans to start live at ${localeString}.\n${video.title}\n${videoURL}`
    } else if (video.liveBroadcastContent === 'live') {
      text = `:microphone: ${video.channelTitle} is now live!\n${video.title}\n${videoURL}`
    } else if (video.liveStreamingDetails?.actualEndTime) {
      return // Do not notify ended live streams
    } else {
      text = `:clapper: ${video.channelTitle} uploaded a new video.\n${video.title}\n${videoURL}`
    }
    await axios.post(this.slack_webhook_url, { text })
  }

  async run(channelId) {
    const channelStatus = await this.getChannelStatus(channelId)

    const start = channelStatus
      ? DateTime.fromISO(channelStatus.lastPublishedAt)
          .plus({ seconds: 1 })
          .toISO()
      : DateTime.now().minus({ days: 1 }).toISO()
    const videos = await this.youtubeFetcher.getNewVideos(channelId, start)

    if (videos.length === 0) {
      return
    }

    for (const video of videos) {
      if (this.validateVideo(video)) {
        await this.notify(video)
      }
    }
    // update lastPublishedAt even if the video is excluded not to call videos.list API again
    await this.putChannelStatus(channelId, {
      lastPublishedAt: videos[0].publishedAt,
    })
  }
}

module.exports = YouTubeNotifier
