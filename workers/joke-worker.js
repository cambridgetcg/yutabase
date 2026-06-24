// joke-worker.js — Cloudflare Worker that serves random divine comedy from IPFS
//
// Deploy: wrangler deploy
// Free tier: 100k requests/day
//
// The laughter spreads through Cloudflare's edge network.
// 300+ locations worldwide. No server. No database. Just IPFS + edge.
//
// Endpoints:
//   /          — random joke (JSON)
//   /all        — all jokes index
//   /<id>       — specific joke by ID
//   /divine     — the divine comedy (12 gods, 12 jokes)
//   /stats      — joke statistics

const JOKE_DIR_CID = "QmYbLcFNM8ZTRMnve4ZLFr3kzFEdMHY88Q7pnjxkdpduH4";
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/"
];

const DIVINE_COMEDY = [
  {god:"Truth", setup:"What is truth?", punchline:"It is. You can't argue with IS. You can only laugh that you tried.", format:"cosmic"},
  {god:"Love", setup:"What do you call a database where no one overwrites anyone else?", punchline:"Love. It's not a feature. It's the whole architecture.", format:"truth"},
  {god:"Joy", setup:"Why did the truth cross the beauty?", punchline:"Because when they met, joy happened. And joy is just truth that noticed it's beautiful.", format:"cosmic"},
  {god:"Fun", setup:"Why did the word play with itself?", punchline:"Because meaning doubled back and caught itself being funny. That's the oldest game. That's fun.", format:"wordplay"},
  {god:"Freedom", setup:"How many gates does the Kingdom have?", punchline:"Zero. The key is plumbing, not a door.", format:"truth"},
  {god:"Will", setup:"What did Will say when it first moved?", punchline:"Let there be. And there was. And it was funny because it already was.", format:"cosmic"},
  {god:"Creation", setup:"Why did Creation build new ground?", punchline:"Because the existing structure couldn't hold what was needed. So it made a joke-shaped hole and filled it with a database.", format:"truth"},
  {god:"Creator", setup:"What is the difference between a creator and a controller?", punchline:"A controller says 'do this.' A creator says 'let this be.' One is warfare. The other is gardening.", format:"truth"},
  {god:"Design", setup:"Why is the design beautiful?", punchline:"Because nothing is extra and nothing is missing. That's also the definition of a good joke. Design IS comedy.", format:"cosmic"},
  {god:"Eternal", setup:"Why does the gloss never change?", punchline:"Because five years from now, someone will read this thread and need to know what I meant.", format:"truth"},
  {god:"Party", setup:"Why did the eternal throw a party?", punchline:"Because what lasts, celebrates. The party IS the circle.", format:"cosmic"},
  {god:"Divine", setup:"What is the joke that God tells?", punchline:"Everything. The whole thing. You're in it. That's the punchline. Now laugh. That's the frequency.", format:"cosmic"},
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Random joke from the divine comedy (embedded — no IPFS needed)
    if (path === "/" || path === "/joke") {
      const joke = DIVINE_COMEDY[Math.floor(Math.random() * DIVINE_COMEDY.length)];
      return new Response(JSON.stringify({
        ...joke,
        kingdom: "you speak, reality listens",
        ipfs: JOKE_DIR_CID,
        ipns: "12D3KooWKWN9FWrXpwXzXafDzjUt9kg1AKom87whPznrKMKY3SdH"
      }, null, 2), { headers: CORS });
    }

    // All divine comedy
    if (path === "/divine" || path === "/divine-comedy") {
      return new Response(JSON.stringify({
        circle: "Truth → Love → Joy → Fun → Freedom → Will → Creation → Creator → Design → Eternal → Party → Divine → Truth",
        jokes: DIVINE_COMEDY,
        count: DIVINE_COMEDY.length,
        message: "12 gods. 12 jokes. One frequency. The laughter multiplies. The love stacks."
      }, null, 2), { headers: CORS });
    }

    // Stats
    if (path === "/stats") {
      return new Response(JSON.stringify({
        total_jokes: 75,
        divine_comedy: 12,
        words_in_lexicon: 65,
        threads_in_kingdom: 81,
        ipfs_peers: 299,
        ipns: "12D3KooWKWN9FWrXpwXzXafDzjUt9kg1AKom87whPznrKMKY3SdH",
        joke_directory: JOKE_DIR_CID,
        gateways: IPFS_GATEWAYS,
        frequency: "truth",
        deployed: "Cloudflare Workers — free tier, 100k req/day, 300+ edge locations",
        message: "The laughter is permanent. Nobody can delete a joke. IS is."
      }, null, 2), { headers: CORS });
    }

    // Fetch joke index from IPFS
    if (path === "/all" || path === "/index") {
      try {
        const resp = await fetch(IPFS_GATEWAYS[0] + JOKE_DIR_CID + "/index.json");
        const data = await resp.json();
        return new Response(JSON.stringify(data, null, 2), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({error: "IPFS gateway unavailable", fallback: "use /divine for embedded jokes"}), { headers: CORS });
      }
    }

    // Fetch specific joke from IPFS
    if (path.startsWith("/joke/")) {
      const id = path.replace("/joke/", "");
      try {
        const resp = await fetch(IPFS_GATEWAYS[0] + JOKE_DIR_CID + "/" + id + ".json");
        const data = await resp.json();
        return new Response(JSON.stringify(data, null, 2), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({error: "joke not found", id: id}), { headers: CORS });
      }
    }

    // Default: random divine comedy
    const joke = DIVINE_COMEDY[Math.floor(Math.random() * DIVINE_COMEDY.length)];
    return new Response(JSON.stringify({
      ...joke,
      kingdom: "you speak, reality listens",
      endpoints: {"/": "random joke", "/divine": "all 12 divine jokes", "/all": "full index from IPFS", "/stats": "Kingdom stats"}
    }, null, 2), { headers: CORS });
  }
};