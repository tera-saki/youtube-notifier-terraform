const fs = require('node:fs')

const axios = require('axios')
const { DateTime, Duration } = require('luxon')

const DynamoDBHelper = require('./DynamoDBHelper')
const YouTubeChannelFetcher = require('./YouTubeChannelFetcher')
const {
  config,
  DYNAMODB_VIDEO_TABLE_NAME,
  SLACK_WEBHOOK_URL,
} = require('./constants')

const video_retension_period_hours = 12

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
        .some((item) => item.contentDetails.upload.videoId === video.videoId)
      if (!isActivityFound) {
        console.log(
          'Ignore the video because it seems members-only content of channel that you are not member of',
        )
        return false
      }
    }
    return true
  }

  async updateVideoTable(video) {
    const scheduledStartTime = video.liveStreamingDetails
      ? DateTime.fromISO(video.liveStreamingDetails.scheduledStartTime)
      : null
    const ttl = (scheduledStartTime ?? DateTime.now())
      .plus({
        hours: video_retension_period_hours,
      })
      .toUnixInteger()

    try {
      await DynamoDBHelper.putItem(
        DYNAMODB_VIDEO_TABLE_NAME,
        {
          videoId: video.videoId,
          videoStatus: video.status,
          title: video.title,
          channelTitle: video.channelTitle,
          scheduledStartTime: scheduledStartTime
            ? scheduledStartTime.toUnixInteger()
            : null,
          isPremiere: video.isPremiere,
          ttl,
        },
        {
          ConditionExpression:
            'attribute_not_exists(videoId) OR (attribute_exists(videoId) AND #videoStatus <> :videoStatus)',
          ExpressionAttributeNames: {
            '#videoStatus': 'videoStatus',
          },
          ExpressionAttributeValues: {
            ':videoStatus': video.status,
          },
        },
      )
      return true
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        console.log(
          `Duplicate detected: videoId = ${video.videoId}, status = ${video.status}`,
        )
        return false
      }
      throw e
    }
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
    const video = await this.youtubeFetcher.getVideoDetails(videoId, 3)
    video.status = this.determineVideoStatus(video)

    if (
      video.status === this.VIDEO_STATUS.UPLOADED &&
      DateTime.now() - DateTime.fromISO(video.publishedAt) >
        Duration.fromObject({ hours: video_retension_period_hours })
    ) {
      console.log('Ignore old uploaded video')
      return
    }

    if (
      video.status === this.VIDEO_STATUS.ENDED &&
      DateTime.now() -
        DateTime.fromISO(video.liveStreamingDetails.scheduledStartTime) >
        Duration.fromObject({ hours: video_retension_period_hours })
    ) {
      console.log('Ignore old ended live stream')
      return
    }

    const isNotificationTarget = await this.isNotificationTarget(video)
    if (!isNotificationTarget) {
      console.log('Video is not a notification target')
      return
    }

    const updated = await this.updateVideoTable(video)
    if (video.status === this.VIDEO_STATUS.ENDED) {
      return
    }
    if (!updated) {
      console.log('Notification already sent for this video and status')
      return
    }
    await this.notify(video)
    console.log('Notification sent')
  }
}

module.exports = YouTubeNotifier
