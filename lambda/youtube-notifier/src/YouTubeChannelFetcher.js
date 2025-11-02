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

  // Get new videos from a channel since a given time
  async getNewVideos(channelId, from) {
    const activityResponses = await this.client.activities.list({
      part: ['snippet', 'contentDetails'],
      channelId,
      publishedAfter: from,
      maxResults: 10,
    })

    const videoIds = activityResponses.data.items
      .filter((item) => item.snippet.type === 'upload')
      .map((item) => item.contentDetails.upload.videoId)

    if (videoIds.length === 0) {
      return []
    }

    const videoListResponses = await this.client.videos.list({
      part: ['snippet', 'liveStreamingDetails', 'status'],
      id: videoIds.join(','),
    })

    const videos = videoListResponses.data.items.map((video) => ({
      videoId: video.id,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      liveBroadcastContent: video.snippet.liveBroadcastContent,
      liveStreamingDetails: video.liveStreamingDetails,
      status: this._determineVideoStatus(video),
    }))

    return videos
  }

  // liveBroadcastContentが実際のステータスと同期していない場合あり
  _determineVideoStatus(video) {
    if (!video.liveStreamingDetails) {
      return 'uploaded'
    } else if (video.liveStreamingDetails.actualEndTime) {
      return 'live_ended'
    } else if (video.liveStreamingDetails.actualStartTime) {
      return 'live_started'
    } else if (video.status.uploadStatus === 'processed') {
      return 'upcoming_premiere'
    } else {
      return 'upcoming_live'
    }
  }
}

module.exports = YouTubeChannelFetcher
