const axios = require('axios')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const s3 = new S3Client()

const BUCKET_NAME = process.env.S3_BUCKET_NAME
const IP_RANGE_URL = 'https://www.gstatic.com/ipranges/goog.json'

exports.handler = async (event) => {
  console.log('Starting IP range fetch process')

  try {
    const response = await axios.get(IP_RANGE_URL)
    const ipRangeData = response.data

    const key = 'ipranges.json'

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(ipRangeData),
        ContentType: 'application/json',
      }),
    )
    console.log(`Successfully stored IP ranges to s3://${BUCKET_NAME}/${key}`)
  } catch (error) {
    console.error('Error fetching or storing IP ranges:', error)
  }
}
