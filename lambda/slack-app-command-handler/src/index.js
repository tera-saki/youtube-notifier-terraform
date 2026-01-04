const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { DateTime } = require('luxon')

const dynamodbClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamodbClient)

const DYNAMODB_VIDEO_TABLE_NAME = process.env.DYNAMODB_VIDEO_TABLE_NAME

async function getScheduledVideos() {
  const params = {
    TableName: DYNAMODB_VIDEO_TABLE_NAME,
  }

  const result = await docClient.send(new ScanCommand(params))
  return result.Items.filter((video) => video.scheduledStartTime).sort(
    (a, b) => a.scheduledStartTime - b.scheduledStartTime,
  )
}

function formatVideoBlocks(videos) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Scheduled Videos*`,
      },
    },
    {
      type: 'divider',
    },
  ]

  videos.forEach((video) => {
    const scheduledStartTime = DateTime.fromSeconds(video.scheduledStartTime)
      .setZone('Asia/Tokyo')
      .toFormat('MM/dd HH:mm')
    const url = `https://www.youtube.com/watch?v=${video.videoId}`
    const emoji = video.isPremiere ? ':circus_tent:' : ':microphone:'

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} ${scheduledStartTime} ${video.title} (${video.channelTitle})`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Watch',
        },
        url,
      },
    })

    blocks.push({
      type: 'divider',
    })
  })

  return blocks
}

exports.handler = async (event) => {
  console.log('Received Slack command:', event)

  try {
    const videos = await getScheduledVideos()
    const blocks = formatVideoBlocks(videos)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        blocks,
      }),
    }
  } catch (error) {
    console.error('Error fetching video table contents:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        text: 'Failed to fetch video table contents.',
      }),
    }
  }
}
