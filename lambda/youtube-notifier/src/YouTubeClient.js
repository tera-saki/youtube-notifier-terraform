const fs = require('node:fs')

const { youtube } = require('@googleapis/youtube')
const { OAuth2Client } = require('google-auth-library')

class YouTubeClient {
  constructor({ credentialsPath, tokenPath }) {
    this.credentialsPath = credentialsPath
    this.tokenPath = tokenPath
  }

  loadCredentials() {
    const credentials = JSON.parse(fs.readFileSync(this.credentialsPath))
    const token = JSON.parse(fs.readFileSync(this.tokenPath))
    return { credentials, token }
  }

  createClient() {
    const { credentials, token } = this.loadCredentials()
    const { client_secret, client_id, redirect_uris } = credentials.installed

    const auth = new OAuth2Client(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)
    return youtube({ version: 'v3', auth })
  }
}

module.exports = YouTubeClient
