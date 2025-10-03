const YouTubeClient = require('./YouTubeClient')

class YouTubeChannelFetcher {
  constructor({ credentialsPath, tokenPath }) {
    this.client = new YouTubeClient({
      credentialsPath,
      tokenPath,
    }).createClient()
  }

  // Get the list of subscribed channels
  async getSubscribedChannels() {
    let channels = []
    let pageToken = null

    do {
      const res = await this.client.subscriptions.list({
        part: ['snippet'],
        mine: true,
        maxResults: 50,
      })
      channels = [...res.data.items, ...channels]
      pageToken = res.nextPageToken
    } while (pageToken)

    return channels.map((c) => ({
      id: c.snippet.resourceId.channelId,
      name: c.snippet.title,
    }))
  }

  // Get new videos from a channel since a given time
  async getNewVideos(channelId, from) {
    const activityResponses = await this.client.activities.list({
      part: ['snippet', 'contentDetails'],
      channelId,
      publishedAfter: from,
      maxResults: 10,
    })

    const activities = {}
    for (const item of activityResponses.data.items) {
      if (item.snippet.type !== 'upload') {
        continue
      }
      const videoId = item.contentDetails.upload.videoId
      const publishedAt = item.snippet.publishedAt
      activities[videoId] = { publishedAt }
    }
    const videoIds = Object.keys(activities)

    if (videoIds.length === 0) {
      return []
    }

    const videoListResponses = await this.client.videos.list({
      part: ['snippet', 'liveStreamingDetails'],
      id: videoIds.join(','),
    })

    const videos = videoListResponses.data.items.map((video) => ({
      videoId: video.id,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      liveBroadcastContent: video.snippet.liveBroadcastContent,
      liveStreamingDetails: video.liveStreamingDetails,
      // use publishedAt from activities.list response
      // because videos.list returns stream created time (not broadcast start time)
      // as publishedAt for live streams
      publishedAt: activities[video.id].publishedAt,
    }))

    return videos
  }
}

module.exports = YouTubeChannelFetcher
