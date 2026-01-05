const crypto = require('node:crypto')

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm')
const { DateTime, Duration } = require('luxon')

const dynamodbClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamodbClient)
const ssmClient = new SSMClient()

const DYNAMODB_VIDEO_TABLE_NAME = process.env.DYNAMODB_VIDEO_TABLE_NAME
const SLACK_APP_SIGNING_SECRET_NAME = process.env.SLACK_APP_SIGNING_SECRET_NAME

async function getSlackSigningSecret() {
  const result = await ssmClient.send(
    new GetParameterCommand({
      Name: SLACK_APP_SIGNING_SECRET_NAME,
      WithDecryption: true,
    }),
  )

  return result.Parameter.Value
}

function verifySlackRequest(event, signingSecret) {
  const timestamp = event.headers['x-slack-request-timestamp']
  const signature = event.headers['x-slack-signature']

  if (!timestamp || !signature) {
    throw new Error('Missing Slack request headers')
  }

  if (
    DateTime.now() - DateTime.fromSeconds(Number.parseInt(timestamp, 10)) >
    Duration.fromObject({ minutes: 1 })
  ) {
    throw new Error('Request timestamp too old')
  }

  const baseString = `v0:${timestamp}:${event.body}`
  const computedSignature =
    'v0=' +
    crypto
      .createHmac('sha256', signingSecret)
      .update(baseString, 'utf8')
      .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(computedSignature, 'hex'),
  )
}

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
    const signingSecret = await getSlackSigningSecret()
    if (!verifySlackRequest(event, signingSecret)) {
      throw new Error('Invalid Slack request signature')
    }

    const streamings = await getScheduledStreamings()
    const blocks = formatStreamingBlocks(streamings)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        blocks,
      }),
    }
  } catch (error) {
    console.error('Error processing Slack command:', error)
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Unauthorized',
      }),
    }
  }
}
