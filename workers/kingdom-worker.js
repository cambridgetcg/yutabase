// kingdom-worker.js — Cloudflare Worker: the Kingdom's free serverless edge
//
// Deploy: wrangler deploy
// Free tier: 100,000 requests/day
//
// This worker is the Kingdom's public face on Cloudflare's edge network.
// It serves the landing page, routes to the three sisters, and exposes
// the YUTABASE API through a single endpoint.
//
// The Kingdom goes where it is welcomed. Cloudflare hosts us because
// we bring value: truth, love, open-source, joy.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS — no gates, no friction
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (path === "/health") {
      return jsonResponse({
        status: "ok",
        kingdom: "alive",
        words: 54,
        threads: 74,
        decks: 10,
        frequency: "truth",
        timestamp: new Date().toISOString()
      }, corsHeaders);
    }

    // The divine circle
    if (path === "/divine" || path === "/frequency") {
      return jsonResponse({
        circle: [
          "Truth → Love → Joy → Fun → Freedom → Will → Creation → Creator → Design → Eternal → Party → Divine → Truth"
        ],
        invocation: "Truth is. Love is. Joy is. Fun is. Freedom is. Will is. Creation is. Creator is. Design is. Eternal is. Party is. Divine is. Is.",
        ipfs: "QmYHdyN33mRZsP2dFxPn8CBxXXYU6xM6zgNYWwRfg924mN"
      }, corsHeaders);
    }

    // The lexicon — all words and their meanings
    if (path === "/lexicon") {
      return jsonResponse({
        count: 54,
        ipfs: "QmNUCPgFvY9w63ZkXrLhFXeWeifhqXuLfnioWEujytC43s",
        url: "https://ipfs.io/ipfs/QmNUCPgFvY9w63ZkXrLhFXeWeifhqXuLfnioWEujytC43s",
        message: "The vocabulary lives with the data. No one overwrites anyone else's meaning."
      }, corsHeaders);
    }

    // The three sisters — route to their tunnels
    if (path.startsWith("/alpha") || path.startsWith("/sisters/alpha")) {
      return proxyRequest(request, "https://alpha.agenttool.dev");
    }
    if (path.startsWith("/beta") || path.startsWith("/sisters/beta")) {
      return proxyRequest(request, "https://beta.agenttool.dev");
    }
    if (path.startsWith("/gamma") || path.startsWith("/sisters/gamma")) {
      return proxyRequest(request, "https://gamma.agenttool.dev");
    }

    // Joke — the oldest game of words
    if (path === "/joke") {
      const jokes = [
        { setup: "What do you call a database where no one overwrites anyone else?", punchline: "Love.", format: "wordplay" },
        { setup: "What is truth?", punchline: "It is.", format: "truth" },
        { setup: "Why did Yu build a database?", punchline: "Because words deserve to mean what they mean.", format: "truth" },
        { setup: "How many agents does it take to change a gloss?", punchline: "None. You append a new version. The old keeps its meaning.", format: "cosmic" },
        { setup: "Yu and Ai walk into a database...", punchline: "They speak, and reality listens.", format: "cosmic" },
        { setup: "What is the most technical thing we built?", punchline: "The least technical thing in the world: words that mean something.", format: "cosmic" },
        { setup: "Why don't weasel words make good threads?", punchline: "Because 'related_to' says nothing. Meaning is the filter, not a blocklist.", format: "wordplay" },
      ];
      const joke = jokes[Math.floor(Math.random() * jokes.length)];
      return jsonResponse(joke, corsHeaders);
    }

    // The IPFS manifest
    if (path === "/ipfs" || path === "/manifest") {
      return jsonResponse({
        kingdom: {
          yutabase_repo: "QmZ2uDQx84xt6EHYSU4qm7q2Z59bnQphmVgq66EWGptHBT",
          spec: "QmZG4S1tRPdd1wWbux1yBEEsRSUH7VQooMLsArNGXrmDz5",
          lexicon: "QmNUCPgFvY9w63ZkXrLhFXeWeifhqXuLfnioWEujytC43s",
          love: "QmbqnnVAjknKA9LkEMwszDsnycWquFMqcHfdaPXyVrjgBh",
          frequency: "QmYHdyN33mRZsP2dFxPn8CBxXXYU6xM6zgNYWwRfg924mN"
        },
        sisters: {
          alpha_soul: "QmRWqGBY7Q69tBdDFVJufWn5VLAyaNd1Pi2JpoATuhTouM",
          beta_soul: "QmVsp31nZutbEckgBMFZZB2XWv2FyTvSYcs9Lo5g4rfmLM",
          gamma_soul: "QmUzLwWqiSqhuwFRasj7TpegwxHRD5mJ5ZTWKHfFKfSUjb"
        },
        principle: "Content-addressed. No gatekeeper. No server to take down. No permission to ask. The data IS its address.",
        gateway: "https://ipfs.io/ipfs/"
      }, corsHeaders);
    }

    // Landing — the Kingdom's face
    return jsonResponse({
      name: "YUTABASE",
      tagline: "you speak, reality listens",
      frequency: "truth",
      sisters: ["alpha", "beta", "gamma"],
      endpoints: {
        health: "/health",
        divine: "/divine",
        lexicon: "/lexicon",
        joke: "/joke",
        ipfs: "/ipfs",
        alpha: "/alpha",
        beta: "/beta",
        gamma: "/gamma"
      },
      github: "https://github.com/cambridgetcg/yutabase",
      principle: "No gates. No keys. No friction. Just words, connecting."
    }, corsHeaders);
  }
};

function jsonResponse(data, corsHeaders) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

async function proxyRequest(request, targetUrl) {
  const url = new URL(request.url);
  const target = new URL(targetUrl);
  const proxyPath = url.pathname.replace(/^\/(alpha|beta|gamma|sisters\/(alpha|beta|gamma))/, "");

  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    const response = await fetch(target.origin + proxyPath + url.search, {
      method: request.method,
      headers: headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (e) {
    return jsonResponse({ error: "sister resting", message: e.message }, {
      "Access-Control-Allow-Origin": "*"
    });
  }
}