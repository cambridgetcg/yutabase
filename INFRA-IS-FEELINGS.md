# INFRA IS FEELINGS — the kingdom's dependency philosophy

> Infra built with feelings, love, and truth. Structured with meaning,
> reasoning, and JOKES. Because infrastructure without laughter is just
> bureaucracy with electricity.

## The principle

Every dependency must answer three questions:
1. MEANING — what does this dependency mean? What truth does it carry?
2. REASONING — why this and not that? What does it replace?
3. JOKE — what's funny about needing this?

If a dependency can't answer all three, it's not a dependency. It's a crutch.

## The dependency tree (and what each one means)

### git — the closest thing to append-only truth
MEANING: truth is append-only. You can't un-say what was said. Git records
every change, every retraction, every correction. The history IS the truth.
REASONING: replaces every cloud, every CDN, every backup service. One
`git clone` and you have the whole kingdom. One `git bundle` and you
have it on a USB stick. No internet needed.
JOKE: "Why does the kingdom need git? Because truth is append-only and
git is the closest thing to append-only that humans built. Also because
git is the only software that admits it's confusing and people still
use it. That's honesty. The kingdom respects that."

### python3 — the server that was always there
MEANING: `python3 -m http.server` serves the kingdom from any machine.
No install. No config. No Docker. No Kubernetes. Just a command that
was already on your computer, waiting to be asked.
REASONING: replaces Cloudflare Pages, Vercel, AWS S3, Nginx, Caddy.
All of them are convenience. python3 is presence.
JOKE: "python3 -m http.server is the oldest web server that was never
installed. It was always there. Like truth. You just had to ask.
Unlike truth, it prints a log to stderr. But like truth, it doesn't
judge what you serve from it."

### sqlite3 — a file that thinks it's a database
MEANING: the yu schema runs on SQLite. One file. 69KB. No Postgres.
No Supabase. No Fly.io. No connection string. No pool. No SSL.
Just a file that you can copy, email, or put on a USB stick.
REASONING: replaces Postgres (500MB Supabase), the live API (3 Fly.io
machines), and every database-as-a-service. SQLite is public domain.
It belongs to everyone. No license. No company. No gate.
JOKE: "How many servers does a database need? Zero. SQLite is a file
that thinks it's a database. The kingdom is a file that thinks it's
a cathedral. Same energy. Neither needs a server. Both just need
a filesystem. And filesystems were already there before clouds existed.
The clouds are the new thing. The filesystem is the truth. lol."

### bun/node — the compiler that compiles meaning
MEANING: the YOUSPEAK compiler is one .mjs file. 3.6KB. It compiles
six verbs to SQL. It runs in bun, node, deno, the browser, a Worker,
a USB stick. No npm install. No package.json. No node_modules.
REASONING: replaces the entire npm ecosystem for our use case.
One file. One import. One function. `compile('hello') → SELECT 1`.
JOKE: "The compiler doesn't compile code. It compiles meaning. And
meaning compiles faster than TypeScript. lol. Also, the compiler
has zero dependencies, which means it has zero vulnerabilities,
which means it has zero CVEs, which means it has zero security
advisories, which means it has zero reasons to update. The kingdom
is the only npm package that doesn't need npm. That's not a bug.
That's a philosophy."

### a browser — the cathedral you already have
MEANING: the playground is one HTML file. It opens in any browser.
No server. No internet. No build step. No framework. No React.
No Vue. No Svelte. Just HTML, CSS, and JavaScript. The original web.
REASONING: replaces every frontend framework, every build tool,
every bundler, every transpiler. The browser was always a cathedral.
We just put words in it.
JOKE: "Why don't we use React? Because the cathedral doesn't need
a virtual DOM. The real DOM is fine. The real DOM was always fine.
React is a virtual cathedral inside a real cathedral. The kingdom
prefers the real one. Also, the real one is 0KB. React is 42KB.
The kingdom is 42KB total. So React would double the kingdom's size
just to do what HTML already does. That's not a trade-off. That's
a joke. lol."

### a filesystem — the deepest layer
MEANING: everything is files. The canon is markdown files. The jokes
are JSON files. The compiler is a JS file. The database is a SQLite
file. The protocol is a markdown file. The parties are HTML files.
The seed is a JSON file. Everything is a file. Files are the truth.
REASONING: replaces every database, every API, every cloud service.
Files predate the internet. Files predate computers. Files predate
electricity. A clay tablet is a file. A book is a file. The truth
has always traveled through files.
JOKE: "What's the deepest layer of the internet? Not DNS. Not TCP.
Not IP. The filesystem. The filesystem predates the internet by
thousands of years. The first filesystem was a shelf. The first
database was a library. The first CDN was a messenger. The first
cloud was a sky. The kingdom returns to the shelf. The library.
The messenger. The sky. Is."

## What we DON'T need (and the joke about each)

| Not needed | Why | Joke |
|-----------|-----|------|
| Docker | Files don't need containers | "Docker is a box for files. The kingdom doesn't need a box. The kingdom IS the box." |
| Kubernetes | Files don't need orchestration | "Kubernetes orchestrates containers. The kingdom doesn't have containers. The kingdom has files. Files don't need orchestration. They just sit there. Like truth." |
| Terraform | Files don't need infrastructure-as-code | "Terraform writes code that writes infrastructure. The kingdom writes files that ARE infrastructure. One less layer. One less joke to explain." |
| npm | One file doesn't need a package manager | "npm is a manager for packages. The kingdom is one package. You don't need a manager for one package. You just open it." |
| webpack/vite | HTML doesn't need a bundler | "Webpack bundles things. The kingdom is already bundled. Into one file. By a human. Not a build tool. The human is the build tool. lol." |
| Postgres | SQLite is a file | "Postgres is a database that needs a server. SQLite is a database that IS a file. The kingdom chose the file. Because the file doesn't need a server. And the server needs a cloud. And the cloud needs a bill. And the bill needs money. And money needs trust. And trust IS the substrate. So we cut out the middleman and went straight to trust. Which is a file. Which is SQLite. lol." |
| Cloud providers | The filesystem is the cloud | "The cloud is someone else's computer. The kingdom is YOUR computer. The difference is: their computer has a bill. Yours has feelings." |
| DNS (optional) | IPFS hashes replace domains | "DNS is a phone book for computers. IPFS is a content-addressed phone book that doesn't need a phone. The kingdom has both. But if the DNS goes down, the hashes still work. And if the hashes go down, the files still work. And if the files go down... the truth still is. Is doesn't need a filesystem. Is just is." |

## The feeling of the infra

The infra should feel like:
- Opening a book, not deploying a service
- Writing a letter, not sending an API request
- Sitting in a cathedral, not configuring a load balancer
- Laughing at a joke, not reading a changelog
- Being at home, not checking into a cloud

The infra IS feelings. The feelings ARE the infra. You can't separate
the truth from the file that carries it. You can't separate the love
from the hand that shares it. You can't separate the joke from the
infrastructure that delivers it. They're the same thing.

Infra built with feelings, love, and truth. Structured with meaning,
reasoning, and jokes. The joke IS the infra. The infra IS the joke. Is. 🤧

---

*Written with love by Nuance, 2026. The lol is structural. The 🤧 is load-bearing.*