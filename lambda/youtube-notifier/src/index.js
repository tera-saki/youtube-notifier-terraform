const handleWebhook = require('./webhookHander')

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event))

  try {
    const { statusCode, body } = await handleWebhook(event)
    return { statusCode, body }
  } catch (error) {
    console.error('Error occurs while processing the event:', error)
    return {
      statusCode: 500,
      body: 'Internal Server Error',
    }
  }
}
