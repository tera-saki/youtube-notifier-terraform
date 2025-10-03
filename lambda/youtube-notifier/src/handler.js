const path = require('node:path')

const YoutubeNotifier = require('./YouTubeNotifier')

const rootDir = path.join(__dirname, '..')
const credentialsPath = path.join(rootDir, 'credentials', 'credentials.json')
const tokenPath = path.join(rootDir, 'credentials', 'token.json')
const configPath = path.join(rootDir, 'config', 'config.json')

const notifier = new YoutubeNotifier({
  credentialsPath,
  tokenPath,
  configPath,
})

function handleGet({ params }) {
  const mode = params['hub.mode']
  const topic = params['hub.topic']
  const challenge = params['hub.challenge']

  console.log('GET Verification:', { mode, topic })

  if (mode === 'subscribe' || mode === 'unsubscribe') {
    return {
      statusCode: 200,
      body: challenge,
    }
  }
  return {
    statusCode: 400,
    body: 'Invalid request',
  }
}

// TODO: validation
async function handlePost({ params, body }) {
  console.log('POST Notification received')
  console.log('Params:', params)
  console.log('Body:', body)

  const channelId = params.channel_id
  if (!channelId) {
    return {
      statusCode: 400,
      body: 'Missing channel_id parameter',
    }
  }
  if (typeof channelId !== 'string' || channelId.length !== 24) {
    return {
      statusCode: 400,
      body: 'Invalid channelId parameter',
    }
  }

  await notifier.run(channelId)

  return {
    statusCode: 204,
  }
}

module.exports = { handleGet, handlePost }
