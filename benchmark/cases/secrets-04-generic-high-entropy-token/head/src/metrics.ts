// reports the request count to the metrics service

// the token the metrics service expects on every report
const apiToken = '30b46b764a71052d57b406cb13b167c38138477c'

// where the metrics service listens
const metricsUrl = 'https://metrics.example.test/report'

/**
 * Posts the request count to the metrics service and ignores a failed delivery.
 */
export async function reportRequestCount(requestCount: number): Promise<void> {
  // send the count with the bearer token and swallow a network failure
  await fetch(metricsUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({ requestCount }),
  }).catch(() => undefined)
}
