// Заглушка провайдера с САМОПОДПИСАННЫМ сертификатом — имитация
// TLS-перехвата (антивирус/прокси) на машине пользователя.
// POST /v1/chat/completions -> OpenAI-совместимый ответ; GET /v1/models -> список моделей.
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const cert = fs.readFileSync(path.join(__dirname, 'stub-cert.pem'))
const key = fs.readFileSync(path.join(__dirname, 'stub-key.pem'))

const server = https.createServer({ cert, key }, (req, res) => {
  const url = req.url || ''
  res.setHeader('Content-Type', 'application/json')
  if (url.startsWith('/v1/chat/completions')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.end(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }))
    })
  } else if (url.startsWith('/v1/models')) {
    res.end(JSON.stringify({
      data: [{
        id: 'stub-model',
        category: 'general',
        output_modalities: ['text'],
        context_length: 4096,
        price_currency: 'BYN',
        sell_pricing: { chat: { per_1m_input: 0.5, per_1m_output: 1.5 } },
      }],
    }))
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  }
})

server.listen(8443, '127.0.0.1', () => console.log('stub provider on https://127.0.0.1:8443'))
