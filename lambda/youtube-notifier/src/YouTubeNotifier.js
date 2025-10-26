const fs = require('node:fs')

const axios = require('axios')
const { DateTime } = require('luxon')

const { SLACK_WEBHOOK_URL } = require('./constants')

const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')

class YouTubeNotifier {
  constructor({ credentialsPath, tokenPath }) {
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credential file not found: ${credentialsPath}`)
    }
    if (!fs.existsSync(tokenPath)) {
      throw new Error(`Token file not found: ${tokenPath}`)
    }

    this.youtubeFetcher = new YouTubeChannelFetcher({
      credentialsPath,
      tokenPath,
    })

    this.slack_webhook_url = SLACK_WEBHOOK_URL
  }

  getTimeDiffFromNow(datetime) {
    const { days, hours, minutes } = datetime.diffNow([
      'days',
      'hours',
      'minutes',
      'seconds',
    ]).values

    let delta
    if (days === 0 && hours === 0) {
      delta = `${minutes}m`
    } else if (days === 0) {
      delta = `${hours}h${minutes}m`
    } else {
      delta = `${days}d${hours}h${minutes}m`
    }
    return delta
  }

  async notify(video) {
    const videoURL = `https://www.youtube.com/watch?v=${video.videoId}`

    let text
    if (video.status === 'uploaded') {
      text = `:clapper: ${video.channelTitle} uploaded a new video.`
    } else if (video.status === 'live_started') {
      text = `:microphone: ${video.channelTitle} is now live!`
    } else if (
      video.status === 'upcoming_live' ||
      video.status === 'upcoming_premiere'
    ) {
      const scheduledStartTime = DateTime.fromISO(
        video.liveStreamingDetails.scheduledStartTime,
      )
      const localeString = scheduledStartTime
        .setZone('Asia/Tokyo')
        .toLocaleString(DateTime.DATETIME_SHORT, { locale: 'ja' })
      const timeDelta = this.getTimeDiffFromNow(scheduledStartTime)

      if (video.status === 'upcoming_live') {
        text = `:alarm_clock: ${video.channelTitle} plans to start live at ${localeString} (${timeDelta} later).`
      } else {
        text = `:circus_tent: ${video.channelTitle} plans to start premiere at ${localeString} (${timeDelta} later).`
      }
    } else {
      throw new Error(`Unknown video status: ${video.status}`)
    }
    text = `${text}\n${video.title}\n${videoURL}`
    await axios.post(this.slack_webhook_url, { text })
  }

  async run(channelId, start) {
    const videos = await this.youtubeFetcher.getNewVideos(channelId, start)

    for (const video of videos) {
      if (video.status === 'live_ended') {
        continue
      }
      await this.notify(video)
    }
    return videos
  }
}

module.exports = YouTubeNotifier
