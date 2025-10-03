const { handleGet, handlePost } = require('./handler')

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  try {
    const {
      httpMethod,
      queryStringParameters: params,
      requestContext,
      body: requestBody,
    } = event

    const method = httpMethod ?? requestContext.http.method

    let response
    if (method === 'GET') {
      response = handleGet({ params })
    } else if (method === 'POST') {
      response = handlePost({ params, body: requestBody })
    } else {
      throw new Error(`Unsupported HTTP method: ${method}`)
    }

    const { statusCode, body: responseBody } = await response
    return {
      statusCode,
      body: responseBody,
    }
  } catch (error) {
    console.error('Error handling webhook:', error)
    return {
      statusCode: 500,
      body: 'Internal Server Error',
    }
  }
}
