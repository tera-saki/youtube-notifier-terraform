const fs = require('node:fs')

const { google } = require('googleapis')

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

    const auth = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0],
    )

    auth.setCredentials(token)
    return google.youtube({ version: 'v3', auth })
  }
}

module.exports = YouTubeClient
