// Cloudflare Worker: reverse proxy to Binance API (bypasses geo-block on Vercel/Render US IPs)
// Deploy: dash.cloudflare.com -> Workers & Pages -> Create -> paste this -> Deploy
// Usage from ccxt: exchange.urls.api.public = "https://<your-worker>.workers.dev/api/v3"

const UPSTREAM = "https://api.binance.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstreamUrl = UPSTREAM + url.pathname + url.search;

    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    });
    upstreamRequest.headers.delete("host");

    const response = await fetch(upstreamRequest);
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    newResponse.headers.set("Access-Control-Allow-Headers", "*");
    return newResponse;
  },
};
