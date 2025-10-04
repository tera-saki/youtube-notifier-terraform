const handleWebhook = require('./webhookHander')
const handleSchedule = require('./scheduleHandler')
const { generateResponse } = require('./utils')

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  let handler
  if (event.invokedFromScheduler) {
    handler = handleSchedule
  } else {
    handler = handleWebhook
  }

  try {
    const response = await handler(event)
    if (response.statusCode >= 400) {
      console.warn('Error response:', response)
    }
    return response
  } catch (error) {
    console.error('Error occurs while processing the event:', error)
    return generateResponse(500)
  }
}
