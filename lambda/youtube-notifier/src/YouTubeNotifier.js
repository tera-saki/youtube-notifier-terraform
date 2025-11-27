const fs = require('node:fs')

const axios = require('axios')
const { DateTime } = require('luxon')

const DynamoDBHelper = require('./DynamoDBHelper')
const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')
const {
  config,
  DYNAMODB_LOCK_TABLE_NAME,
  SLACK_WEBHOOK_URL,
} = require('./constants')

class YouTubeNotifier {
  VIDEO_STATUS = {
    UPLOADED: 'uploaded',
    STARTED: 'started',
    ENDED: 'ended',
    UPCOMING: 'upcoming',
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

  async getLock(key, ttl) {
    try {
      await DynamoDBHelper.putItem(
        DYNAMODB_LOCK_TABLE_NAME,
        {
          lock_key: key,
          ttl,
        },
        {
          ConditionExpression: 'attribute_not_exists(lock_key)',
        },
      )
      return true
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        console.log('Duplicate detected:', key)
        return false
      }
      throw e
    }
  }

  // liveBroadcastContentが実際のステータスと同期していない場合あり
  determineVideoStatus(video) {
    if (!video.liveStreamingDetails) {
      return this.VIDEO_STATUS.UPLOADED
    }
    const { scheduledStartTime, actualStartTime, actualEndTime } =
      video.liveStreamingDetails

    if (actualEndTime) {
      return this.VIDEO_STATUS.ENDED
    }
    if (actualStartTime) {
      return this.VIDEO_STATUS.STARTED
    }
    return video.isPremiere &&
      DateTime.fromISO(scheduledStartTime) < DateTime.now()
      ? this.VIDEO_STATUS.STARTED
      : this.VIDEO_STATUS.UPCOMING
  }

  async isNotificationTarget(video) {
    if (video.status === this.VIDEO_STATUS.ENDED) {
      console.log('Ignore ended live streams')
      return false
    }

    if (
      video.status === this.VIDEO_STATUS.UPLOADED &&
      DateTime.fromISO(video.publishedAt) < DateTime.now().minus({ days: 1 })
    ) {
      console.log('Ignore old uploaded video')
      return false
    }

    if (config.target_members_only_contents === 'none' && video.isMembersOnly) {
      console.log('Ignore members-only content')
      return false
    }
    if (config.target_members_only_contents === 'subscribed_only') {
      const activities = await this.youtubeFetcher.getNewActivities(
        video.channelId,
      )
      const isActivityFound = activities
        .filter((item) => item.snippet.type === 'upload')
        .some((item) => item.contentDetails.upload.videoId === video.id)
      if (!isActivityFound) {
        console.log(
          'Ignore the video because it seems members-only content of channel that you are not member of',
        )
        return false
      }
    }
    return true
  }

  getTimeDiffFromNow(datetime) {
    const { days, hours, minutes, seconds } = datetime
      .diffNow(['days', 'hours', 'minutes', 'seconds'])
      .toObject()

    if (seconds < 0) {
      return 'starting soon'
    }

    let diff
    if (days === 0 && hours === 0) {
      diff = `${minutes}m later`
    } else if (days === 0) {
      diff = `${hours}h${minutes}m later`
    } else {
      diff = `${days}d${hours}h${minutes}m later`
    }
    return diff
  }

  generateNotificationMessage(video) {
    if (video.status === this.VIDEO_STATUS.UPLOADED) {
      return `:clapper: ${video.channelTitle} uploaded a new video.`
    }

    if (video.status === this.VIDEO_STATUS.STARTED) {
      if (video.isPremiere) {
        return `:circus_tent: ${video.channelTitle} starts a premiere!`
      } else {
        return `:microphone: ${video.channelTitle} is now live!`
      }
    }

    if (video.status === this.VIDEO_STATUS.UPCOMING) {
      const scheduledStartTime = DateTime.fromISO(
        video.liveStreamingDetails.scheduledStartTime,
      )
      const localeString = scheduledStartTime.isValid
        ? scheduledStartTime
            .setZone('Asia/Tokyo')
            .toLocaleString(DateTime.DATETIME_SHORT, { locale: 'ja' })
        : 'unknown time'
      const timeDiff = scheduledStartTime.isValid
        ? this.getTimeDiffFromNow(scheduledStartTime)
        : 'unknown'

      const liveOrPremiere = video.isPremiere ? 'premiere' : 'live stream'
      return `:alarm_clock: ${video.channelTitle} plans to start ${liveOrPremiere} at ${localeString} (${timeDiff}).`
    }

    throw new Error(`Unknown video status: ${video.status}`)
  }

  async notify(video) {
    const videoURL = `https://www.youtube.com/watch?v=${video.videoId}`
    const message = this.generateNotificationMessage(video)
    const text = `${message}\n${video.title}\n${videoURL}`
    await axios.post(this.slack_webhook_url, { text })
  }

  async run(videoId) {
    const video = await this.youtubeFetcher.getVideoDetails(videoId)
    video.status = this.determineVideoStatus(video)

    const isNotificationTarget = await this.isNotificationTarget(video)
    if (!isNotificationTarget) {
      return
    }

    const lockKey = `${videoId}-${video.status}`
    // scheduledStartTimeがundefinedである場合あり
    const ttl = (
      video.status === this.VIDEO_STATUS.UPCOMING &&
      video.liveStreamingDetails.scheduledStartTime
        ? DateTime.fromISO(video.liveStreamingDetails.scheduledStartTime)
        : DateTime.now()
    )
      .plus({ days: 1 })
      .toUnixInteger()
    const lockAcquired = await this.getLock(lockKey, ttl)
    if (!lockAcquired) {
      console.log('Notification already sent for this video and status')
      return
    }
    await this.notify(video)
    console.log('Notification sent')
  }
}

module.exports = YouTubeNotifier
