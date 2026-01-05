const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { DateTime } = require('luxon')

const dynamodbClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamodbClient)

const DYNAMODB_VIDEO_TABLE_NAME = process.env.DYNAMODB_VIDEO_TABLE_NAME

async function getScheduledStreamings() {
  const params = {
    TableName: DYNAMODB_VIDEO_TABLE_NAME,
  }

  const result = await docClient.send(new ScanCommand(params))

  const now = DateTime.now()
  const from = now.minus({ hours: 12 })
  const to = now.plus({ weeks: 1 })

  const streamings = result.Items.filter((s) => {
    if (!s.scheduledStartTime) {
      return false
    }
    const scheduledTime = DateTime.fromSeconds(s.scheduledStartTime)
    return scheduledTime >= from && scheduledTime <= to
  }).sort((a, b) => a.scheduledStartTime - b.scheduledStartTime)

  return streamings
}

function formatStreamingBlocks(streamings) {
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Scheduled Streamings*`,
    },
  }
  const divider = {
    type: 'divider',
  }

  function generateBlock(streaming) {
    const scheduledStartTime = DateTime.fromSeconds(
      streaming.scheduledStartTime,
    )
    const scheduledTimeStr = scheduledStartTime
      .setZone('Asia/Tokyo')
      .setLocale('ja')
      .toFormat('MM/dd(ccc) HH:mm')
    const url = `https://www.youtube.com/watch?v=${streaming.videoId}`
    const emoji =
      streaming.videoStatus === 'started'
        ? streaming.isPremiere
          ? ':circus_tent:'
          : ':microphone:'
        : ':alarm_clock:'

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} ${scheduledTimeStr}~ *${streaming.channelTitle}*\n${streaming.title}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Watch',
        },
        url,
      },
    }
  }

  const blocks = streamings.flatMap((s) => [generateBlock(s), divider])
  return [header, divider, ...blocks]
}

exports.handler = async (event) => {
  console.log('Received Slack command:', event)

  try {
    const streamings = await getScheduledStreamings()
    const blocks = formatStreamingBlocks(streamings)

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
