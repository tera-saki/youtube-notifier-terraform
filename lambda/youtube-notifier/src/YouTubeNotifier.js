const fs = require('node:fs')

const axios = require('axios')
const { DateTime, Duration } = require('luxon')

const { SLACK_WEBHOOK_URL } = require('./constants')

const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')

class YouTubeNotifier {
  VIDEO_STATUS = {
    UPLOADED: 'uploaded',
    LIVE_STARTED: 'live_started',
    LIVE_ENDED: 'live_ended',
    UPCOMING_LIVE: 'upcoming_live',
    UPCOMING_PREMIERE: 'upcoming_premiere',
  }
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

  // liveBroadcastContentが実際のステータスと同期していない場合あり
  determineVideoStatus(video) {
    if (!video.liveStreamingDetails) {
      return this.VIDEO_STATUS.UPLOADED
    }
    const { actualStartTime, actualEndTime } = video.liveStreamingDetails
    if (actualEndTime) {
      return this.VIDEO_STATUS.LIVE_ENDED
    } else if (actualStartTime) {
      // ライブ終了時にactualEndTimeがundefinedのままである場合あり
      if (
        DateTime.now() - DateTime.fromISO(actualStartTime) >
        Duration.fromObject({ minutes: 10 })
      ) {
        console.log('actualEndTime is not set, but the live seems ended')
        return this.VIDEO_STATUS.LIVE_ENDED
      }
      return this.VIDEO_STATUS.LIVE_STARTED
    } else if (video.uploadStatus === 'processed') {
      return this.VIDEO_STATUS.UPCOMING_PREMIERE
    } else {
      return this.VIDEO_STATUS.UPCOMING_LIVE
    }
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
    if (video.status === this.VIDEO_STATUS.UPLOADED) {
      text = `:clapper: ${video.channelTitle} uploaded a new video.`
    } else if (video.status === this.VIDEO_STATUS.LIVE_STARTED) {
      text = `:microphone: ${video.channelTitle} is now live!`
    } else if (
      video.status === this.VIDEO_STATUS.UPCOMING_LIVE ||
      video.status === this.VIDEO_STATUS.UPCOMING_PREMIERE
    ) {
      const scheduledStartTime = DateTime.fromISO(
        video.liveStreamingDetails.scheduledStartTime,
      )
      const localeString = scheduledStartTime
        .setZone('Asia/Tokyo')
        .toLocaleString(DateTime.DATETIME_SHORT, { locale: 'ja' })
      const timeDelta = this.getTimeDiffFromNow(scheduledStartTime)

      if (video.status === this.VIDEO_STATUS.UPCOMING_LIVE) {
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
      video.status = this.determineVideoStatus(video)
      if (video.status === this.VIDEO_STATUS.LIVE_ENDED) {
        continue
      }
      await this.notify(video)
    }
    return videos
  }
}

module.exports = YouTubeNotifier
