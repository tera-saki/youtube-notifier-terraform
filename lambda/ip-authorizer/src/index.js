const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const ip = require('ip')

const s3 = new S3Client()

const BUCKET_NAME = process.env.S3_BUCKET_NAME
const IP_RANGES_PATH = 'ipranges.json'

async function fetchIpRanges() {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: IP_RANGES_PATH,
    }),
  )
  const body = await response.Body.transformToString()
  const data = JSON.parse(body)

  const ipRanges = data.prefixes
    .map((prefix) => prefix.ipv4Prefix)
    .filter(Boolean)

  return ipRanges
}

function isIpInRanges(sourceIp, ipRanges) {
  return ipRanges.some((cidr) => ip.cidrSubnet(cidr).contains(sourceIp))
}

exports.handler = async (event) => {
  console.log('Processing authorization request')

  const sourceIp = event.requestContext.http.sourceIp
  console.log(`Request from IP: ${sourceIp}`)

  try {
    const ipRanges = await fetchIpRanges()
    const isAllowed = isIpInRanges(sourceIp, ipRanges)

    if (isAllowed) {
      console.log('Allowed access')
      return {
        isAuthorized: true,
      }
    } else {
      console.warn(`Denied access from IP: ${sourceIp}`)
      return {
        isAuthorized: false,
      }
    }
  } catch (error) {
    console.error('Authorization error:', error)
    return {
      isAuthorized: false,
    }
  }
}
