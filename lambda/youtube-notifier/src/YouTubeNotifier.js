const fs = require('node:fs')

const axios = require('axios')
const { DateTime } = require('luxon')

const DynamoDBHelper = require('./DynamoDBHelper')
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

    this.slack_webhook_url = SLACK_WEBHOOK_URL
  }

  async getChannelStatus(channelId) {
    return DynamoDBHelper.getItem(DYNAMODB_TABLE_NAME, { channelId })
  }

  async updateChannelStatus(channelId, status) {
    return DynamoDBHelper.updateItem(DYNAMODB_TABLE_NAME, { channelId }, status)
  }

  getTimeDiffFromNow(datetime) {
    const diff = datetime.diffNow(['days', 'hours', 'minutes']).values
    const days = diff.days
    const hours = diff.hours
    const minutes = Number.parseInt(diff.minutes)

    let delta = ''
    if (days > 0) {
      delta += `${days}d`
    }
    if (hours > 0) {
      delta += `${hours}h`
    }
    delta += `${minutes}m`
    return delta
  }

  validateVideo(video) {
    const exclude_words = this.config.exclude_words ?? []
    return exclude_words.every((w) => !video.title.match(w))
  }

  async notify(video) {
    const videoURL = `https://www.youtube.com/watch?v=${video.videoId}`

    let text
    if (!video.liveStreamingDetails) {
      text = `:clapper: ${video.channelTitle} uploaded a new video.`
    } else if (video.liveStreamingDetails.actualEndTime) {
      return // Do not notify ended live streams
    } else if (video.liveStreamingDetails.actualStartTime) {
      text = `:microphone: ${video.channelTitle} is now live!`
    } else {
      const scheduledStartTime = DateTime.fromISO(
        video.liveStreamingDetails.scheduledStartTime,
      )
      const localeString = scheduledStartTime
        .setZone('Asia/Tokyo')
        .toLocaleString(DateTime.DATETIME_SHORT, { locale: 'ja' })
      const timeDelta = this.getTimeDiffFromNow(scheduledStartTime)
      text = `:alarm_clock: ${video.channelTitle} plans to start live at ${localeString} (${timeDelta} later).`
    }
    text = `${text}\n${video.title}\n${videoURL}`
    await axios.post(this.slack_webhook_url, { text })
  }

  async run(channelId) {
    const channelStatus = await this.getChannelStatus(channelId)

    const start = channelStatus?.lastPublishedAt
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
    await this.updateChannelStatus(channelId, {
      lastPublishedAt: videos[0].publishedAt,
    })
  }
}

module.exports = YouTubeNotifier
