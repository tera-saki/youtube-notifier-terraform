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
      channelId: c.snippet.resourceId.channelId,
      name: c.snippet.title,
    }))
  }

  async getNewActivities(channelId) {
    const activityResponses = await this.client.activities.list({
      part: ['snippet', 'contentDetails'],
      channelId,
      maxResults: 10,
    })
    return activityResponses.data.items
  }

  async getVideoDetails(videoId) {
    const videoListResponses = await this.client.videos.list({
      part: ['snippet', 'liveStreamingDetails', 'status', 'statistics'],
      id: videoId,
    })

    const video = videoListResponses.data.items[0]
    return {
      videoId: video.id,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      liveStreamingDetails: video.liveStreamingDetails,
      isPremiere: video.status.uploadStatus === 'processed',
      isMembersOnly: video.statistics.viewCount === undefined,
    }
  }
}

module.exports = YouTubeChannelFetcher
