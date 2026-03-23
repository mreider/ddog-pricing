# Datadog Billing Dimensions: What Generates Costs (Simulator Reference)

Research compiled March 2026 from Datadog docs, third-party analysis, and industry benchmarks.

---

## 1. WHAT GENERATES HOST COUNTS

### Kubernetes
- **1 host = 1 Kubernetes node.** The Datadog Agent runs as a DaemonSet (one per node). Pods are NOT hosts.
- APM is priced **per node, not per pod**. A 10-node cluster running 200 pods = 10 APM hosts.
- **Critical misconfiguration trap:** If the Agent is deployed per-pod instead of per-node via DaemonSet, each pod registers as a separate host. A 50-node cluster with 10 pods/node becomes **500 billable hosts** instead of 50 -- a 10x cost increase.

### Autoscaling Groups / Elastic Infrastructure
- Host count is measured **every hour**.
- Datadog discards the **top 1% of hours** (about 7 hours/month) and bills on the **next highest hour** (99th percentile).
- **Example:** Normally 50 hosts, scale to 200 hosts for a 5-day marketing event. You pay for ~200 hosts for the **entire month**, not the average. (The 5-day spike exceeds the 1% forgiveness window.)
- Short-lived hosts that exist for <1 hour still count for that hour's measurement.

### Fargate Tasks
- Fargate tasks are **not counted as hosts**. They have their own billing: $2.60/task/month (annual).
- Metered every **5 minutes**; charged based on average concurrent tasks across the month.
- Each Fargate task grants: 10 GB ingested spans + 65K indexed spans (for APM).

### ECS (EC2-backed)
- Each EC2 instance running ECS = 1 host. Same billing as any EC2 host.
- Containers on those instances follow container billing rules (see Section 2).

### What counts as a host
- Any physical or virtual OS instance monitored by Datadog
- EC2 instances, GCE instances, Azure VMs, bare metal servers
- Kubernetes nodes
- Each unique `host` tag value in metrics

---

## 2. WHAT GENERATES CONTAINER COUNTS

### Metering Mechanics
- Container count is measured every **5 minutes**.
- At month-end, Datadog calculates the difference between observed containers and your allotment.
- Overages billed at **$0.002/container/hour** (~$1.49/container/month on-demand, $1/month prepaid).

### Allotments per Host
| Tier | Free Containers per Host |
|------|--------------------------|
| Pro | 5 containers/host |
| Enterprise | 10 containers/host |

### What IS counted
- Any container running for **>10 seconds** during a 5-minute metering interval
- Application containers (your microservices)
- Sidecar containers (envoy proxies, log shippers, etc.) -- YES, these count
- Short-lived job containers (if they run >10 seconds)

### What is NOT counted
- **Kubernetes pause containers** -- excluded by default (Agent v7.20+)
- **Datadog Agent containers** -- excluded from allotment
- Containers running **<10 seconds** during the metering interval

### Init Containers
- Init containers typically run briefly during pod startup. If they complete in <10 seconds, they are not counted. If they run longer (e.g., database migration init containers), they count during the intervals they're active.

### Realistic Example: 5-Node K8s Cluster (Enterprise Tier)
- 5 nodes = 5 hosts = **50 free containers** (10/host)
- Running 20 application pods, each with 1 app container + 1 envoy sidecar = **40 containers**
- Plus 5 log-shipper DaemonSet pods = **45 containers total**
- 45 < 50 allotment: **$0 container overage**
- If you add another sidecar per pod: 60 containers - 50 allotment = 10 overage containers
- 10 containers x $0.002/hr x 730 hrs = **$14.60/month overage**

---

## 3. WHAT GENERATES LOG VOLUME

### How Logs Are Billed (Dual Billing)
Logs have **two cost components**:
1. **Ingestion**: $0.10/GB -- everything that enters Datadog
2. **Indexing**: $1.70/million events (15-day retention) -- what you make searchable

The indexing component is typically **8-10x more expensive** than ingestion.

### Log Size Per Event
- A typical structured JSON log line: **500-2,000 bytes** (0.5-2 KB)
- Plain text log line: **200-500 bytes**
- Structured JSON logging adds **1.5-2x overhead** vs plain text due to field names, quotes, braces
- With rich context (trace IDs, span IDs, user IDs, request metadata): closer to **1-2 KB per event**

### Realistic Log Volume Per Service Type (INFO level, production)

| Service Type | Logs per Request | Requests/sec | GB/day Estimate | Events/day |
|-------------|-----------------|--------------|-----------------|------------|
| **Java/Spring Boot microservice** | 3-8 lines | 50 rps | **1-3 GB** | ~1-5M events |
| **Java microservice (DEBUG on)** | 15-40 lines | 50 rps | **5-10 GB** | ~10-30M events |
| **Node.js/Express API** | 2-5 lines | 100 rps | **0.5-2 GB** | ~1-4M events |
| **Nginx/reverse proxy** | 1-2 lines (access + error) | 500 rps | **2-5 GB** | ~5-40M events |
| **Database proxy (PgBouncer, ProxySQL)** | 1 line per query (if enabled) | 200 qps | **1-3 GB** | ~2-15M events |
| **Redis/cache layer** | <1 line (slow log only) | 1000 rps | **0.01-0.1 GB** | ~10-100K events |
| **Message queue consumer** | 1-3 lines per message | 100 msg/s | **0.5-2 GB** | ~1-5M events |

### How Tags Multiply Log Storage
Structured logging with tags (service, env, version, team, etc.) increases the **byte size per event**, NOT the event count. Impact:
- Adding 5 standard tags adds ~200-500 bytes per event
- With 10+ custom tags: log size can increase by **2-3x** vs minimal tagging
- This increases the **ingestion (GB)** cost proportionally
- **Indexing cost** (per million events) is NOT affected by tag count -- it's event-count-based

### Scaling Rule: Logs scale with **traffic volume**, not infrastructure count.
- Double traffic = ~double log volume = ~double log cost
- Adding a node with the same traffic = roughly same log volume

### Realistic Team Example (3 microservices, moderate traffic)
- Service A (Java, 50 rps): 2 GB/day, 3M events/day
- Service B (Node.js, 100 rps): 1.5 GB/day, 2M events/day
- Service C (Node.js, 30 rps): 0.5 GB/day, 1M events/day
- Nginx ingress: 2 GB/day, 5M events/day
- **Total: ~6 GB/day, ~11M events/day**
- Monthly: **~180 GB ingestion, ~330M events**
- Cost: $18 ingestion + $561 indexing (15-day) = **~$579/month for logs**

---

## 4. WHAT GENERATES CUSTOM METRICS

### How Custom Metrics Are Counted
A custom metric = **unique combination of (metric name + all tag values including host tag)**.

The count is the **monthly average of unique time series per hour**.

### What Counts as Custom
- **All OpenTelemetry (OTel) metrics** sent to Datadog = custom metrics
- **All Prometheus metrics** scraped and forwarded to Datadog = custom metrics
- **All StatsD metrics** sent via DogStatsD = custom metrics
- Datadog integration metrics (e.g., system.cpu.user from the Agent) are NOT custom -- they're included with the host
- About 350+ integrations provide "free" metrics; anything beyond those is custom

### How Metric Types Generate Custom Metrics

| Metric Type | Custom Metrics per Unique Tag Combination |
|-------------|------------------------------------------|
| GAUGE | 1 |
| COUNT | 1 |
| RATE | 1 |
| SET | 1 |
| HISTOGRAM | **5** (max, median, avg, 95th pct, count) |
| DISTRIBUTION | **5** (count, sum, min, max, avg) |
| DISTRIBUTION + percentiles | **10** (adds p50, p75, p90, p95, p99) |

### Tag Cardinality Multiplication -- The Critical Cost Driver

Tags are **multiplicative**. Formula:
```
Custom metrics = (metric names) x (unique values of tag1) x (unique values of tag2) x ... x (aggregations per type)
```

**Example 1: Low cardinality (safe)**
- Metric: `api.request.latency`
- Tags: `endpoint` (10 values), `status_code` (5 values), `tier` (3 values)
- = 1 x 10 x 5 x 3 = **150 custom metrics**
- Cost above allotment: 150 x $0.05 = **$7.50/month**

**Example 2: Medium cardinality (watch out)**
- Same metric + `host` tag (5 nodes)
- = 1 x 10 x 5 x 3 x 5 = **750 custom metrics**
- Cost: $37.50/month (from a single metric!)

**Example 3: High cardinality (bill explosion)**
- Same metric + `customer_id` tag (1,000 unique values)
- = 1 x 10 x 5 x 3 x 1,000 = **150,000 custom metrics**
- Cost: 150,000 x $0.05 = **$7,500/month from ONE metric name**

**Example 4: Distribution with percentiles + high cardinality**
- Distribution metric: `api.request.duration`
- Tags: `endpoint` (10), `status` (3), `customer_id` (1,000)
- Unique combos: 10 x 3 x 1,000 = 30,000
- x10 aggregations (distribution + percentiles) = **300,000 custom metrics**
- Cost: **$15,000/month**

### Realistic Custom Metrics for a Typical Team

A well-instrumented microservice typically emits **50-200 custom metric names**. With moderate tag cardinality:

| Source | Metric Names | Avg Tag Combos | Total Custom Metrics |
|--------|-------------|----------------|---------------------|
| Application metrics (latency, throughput, errors) | 20 | 30 | 600 |
| Business metrics (orders, revenue, signups) | 10 | 15 | 150 |
| Cache metrics (hit rate, latency) | 5 | 10 | 50 |
| Queue metrics (depth, consumer lag) | 5 | 5 | 25 |
| Runtime metrics (JVM heap, GC, threads) | 15 | 5 (per host) | 75 |
| **Per service total** | **55** | -- | **~900** |

For 3 services on 5 nodes (Enterprise, 200 metrics/host included = 1,000 included):
- Total custom metrics: ~2,700
- Overage: 2,700 - 1,000 = 1,700
- Cost: 1,700 x $0.05 = **$85/month**

**But** if someone adds a `user_id` tag to request metrics: 2,700 -> potentially 50,000+, costing **$2,450+/month**.

### Metrics Without Limits
- Allows ingesting all tag combinations but only indexing a subset
- Ingested custom metrics overage: **$0.10 per 100** (much cheaper than indexed)
- Indexed custom metrics overage: **$5 per 100** (standard rate)
- Can reduce indexed metric count by 50-90% with proper tag allowlisting

---

## 5. WHAT GENERATES APM SPAN VOLUME

### How Spans Are Generated
Each operation in a traced request generates one span. A typical HTTP request through a service generates:

| Operation | Spans Generated |
|-----------|----------------|
| HTTP server receive | 1 |
| Middleware/auth check | 1-2 |
| Database query | 1 per query |
| Cache lookup | 1 per lookup |
| HTTP client call to another service | 1 |
| Message queue publish | 1 |
| **Typical service total per request** | **3-8 spans** |

### Spans Per Request Across Multiple Services

For a request flowing through N services:

| Request Path | Services Hit | Estimated Spans per Request |
|-------------|-------------|----------------------------|
| Simple API call (1 service, 1 DB query) | 1 | 3-5 |
| API -> service -> DB (2-hop) | 2 | 8-15 |
| API gateway -> 3 microservices -> DB + cache | 4 | 15-30 |
| Complex: API -> auth -> 3 services -> 2 DBs -> cache -> queue | 5+ | 25-50 |

**Rule of thumb: ~5-10 spans per service touched per request.**

### Span Size
- Average span size: **~500 bytes to 2 KB** depending on metadata/tags
- A trace with 20 spans: ~10-40 KB

### Ingestion Volume Calculation

```
Monthly ingested GB = (requests/sec) x (avg spans/request) x (avg span size in KB) x 86400 x 30 / 1,000,000
```

**Example: 3 microservices, 100 rps total, 15 spans/request avg, 1 KB/span**
- Per second: 100 x 15 x 1 KB = 1,500 KB/s = 1.5 MB/s
- Per day: 1.5 x 86,400 = ~130 GB/day
- Per month: ~3,900 GB/month
- **With default head-based sampling (10 traces/sec):** ~390 GB/month (10% sample)

### APM Allotments and Overages

| Item | Per APM Host/Month | Per Fargate Task/Month |
|------|-------------------|----------------------|
| Ingested spans | 150 GB | 10 GB |
| Indexed spans | 1,000,000 | 65,000 |

**Hourly allotments (for burst billing):**
- 0.205 GB ingested per host per hour
- 1,370 indexed spans per host per hour

**Overage rates:**
- Ingested spans: $0.10/GB
- Indexed spans (15-day): $1.70/million

### Sampling and Indexed Spans
- Default sampling: **10 traces per second** per service (head-based)
- Additional: **10 error traces per second** captured separately
- **Indexed spans** = spans you explicitly retain for search (via retention filters)
- Default: Datadog indexes 1 span per trace (the root span) plus error/outlier spans
- 1M indexed spans/host allotment is generous for moderate traffic

### Realistic APM Example (5-node cluster, 3 services, 100 rps)
- 5 APM hosts = 750 GB ingested + 5M indexed spans included
- With 10 traces/sec sampling: ~15 spans/trace x 10/sec x 86,400 x 30 / 1e6 = ~389 GB/month ingested
- 389 GB < 750 GB allotment: **no ingestion overage**
- Indexed: ~10 traces/sec x 1 root span x 86,400 x 30 = ~26M root spans/month
- But with selective retention filters: likely 2-5M indexed spans
- 5M < 5M allotment: **tight but within allotment**

### Scaling Rule: APM costs scale with **request volume** (for span overages) and **infrastructure** (for per-host fees).

---

## 6. WHAT GENERATES RUM SESSIONS

### Session Definition
- A **session** = one user visit to your web or mobile application
- Session starts when user loads the page (RUM SDK initializes)
- Session **expires after 15 minutes of inactivity**
- Session **hard limit: 4 hours** -- after 4 hours, a new session starts automatically
- Datadog uses cookies to stitch page views into sessions

### Sessions vs Page Views in SPAs
- In a **Single Page Application**, route changes are tracked as "views" within the same session
- A user navigating 10 pages in an SPA within 15 minutes = **1 session** (not 10)
- SPA routing does NOT multiply session count (unlike traditional multi-page apps where each page load could be a new session if cookies reset)
- However, if user is idle >15 min then returns, a **new session starts**

### Sessions Per DAU (Daily Active User)
Based on web analytics benchmarks:

| User Behavior | Sessions per DAU |
|--------------|-----------------|
| Average website | **1.4 sessions/user/day** |
| Top 20% engagement | **1.6 sessions/user/day** |
| Top 10% engagement | **1.9 sessions/user/day** |
| E-commerce | **3.5 sessions/user/day** (browse, compare, buy) |
| B2B SaaS (long sessions) | **1.1-1.3 sessions/user/day** |
| News/media | **1.8 sessions/user/day** |

**For a B2B SaaS product**, typical ratio: **~1.2 sessions per DAU**.

### RUM Pricing Tiers
| Product | Annual Price |
|---------|-------------|
| RUM Measure (basic telemetry) | $0.15/1K sessions |
| Session Replay | $2.50/1K sessions (add-on) |
| RUM Investigate (search/filter) | $3.00/1K filtered sessions |
| Product Analytics | $0.80/1K sessions |

### Realistic RUM Example
- B2B SaaS app with 5,000 DAU
- ~1.2 sessions/DAU/day = 6,000 sessions/day = **180,000 sessions/month**
- RUM Measure: 180 x $0.15 = **$27/month**
- With Session Replay (10% sampled): 18K replays = 18 x $2.50 = **$45/month**
- With RUM Investigate: 180 x $3.00 = **$540/month**
- **Total RUM: $72-$612/month** depending on tier

### Scaling Rule: RUM costs scale with **user count and engagement**, not infrastructure.

---

## 7. WHAT GENERATES SYNTHETICS COSTS

### How Tests Are Counted
- Each **execution** of a test from **each location** = 1 test run
- Frequency x locations = total runs per check

### Cost Multiplication Formula
```
Monthly test runs = (number of tests) x (runs per day) x (number of locations) x 30 days
```

Where runs per day = 1440 / check_interval_in_minutes

### API Test Pricing: $5 per 10,000 runs ($0.0005/run)
### Browser Test Pricing: $12 per 1,000 runs ($0.012/run)
### Browser tests are 24x more expensive than API tests per run.

### Typical Test Configurations for a Team with N Services

**API Health Checks (per service):**
- 2-3 critical endpoints per service
- Check every 1-5 minutes
- From 2-4 locations
- Per endpoint: 1440/5 x 3 locations x 30 = **25,920 runs/month** (5-min interval, 3 locations)

**Browser Tests (user journeys):**
- 1-2 critical user flows per app
- Check every 15-30 minutes
- From 2-3 locations
- Per flow: 1440/15 x 2 locations x 30 = **5,760 runs/month** (15-min interval, 2 locations)

### Realistic Synthetics Example: Team with 3 Services

| Test Type | Count | Interval | Locations | Monthly Runs | Monthly Cost |
|-----------|-------|----------|-----------|-------------|-------------|
| API health checks | 8 endpoints | 5 min | 3 | 207,360 | $104 |
| API detailed checks | 4 endpoints | 15 min | 2 | 23,040 | $12 |
| Browser login flow | 1 test | 15 min | 2 | 5,760 | $69 |
| Browser checkout flow | 1 test | 30 min | 2 | 2,880 | $35 |
| **Total** | | | | **239,040** | **~$220/month** |

### Aggressive Monitoring Example (from Checkly analysis)
- 16 page routes, every 4 min, 4 regions: **709,120 browser runs/month = $8,509/month**
- 32 API endpoints x 4 inputs, every 2 min, 4 regions: **11M API runs/month = $5,530/month**

### Scaling Rule: Synthetics costs scale with **number of endpoints/flows monitored and check frequency**, NOT with traffic.

---

## 8. REALISTIC TEAM PROFILES

### Profile A: Small Team (3 Microservices on K8s)

**Infrastructure:**
- 5 Kubernetes nodes (8 GB RAM each)
- 20 application pods (plus sidecars)
- 3 microservices + 1 nginx ingress
- 1 PostgreSQL database (managed, e.g., RDS)
- ~100 requests/sec combined
- B2B SaaS with 2,000 DAU

| Cost Category | Calculation | Monthly Cost |
|--------------|-------------|-------------|
| Infrastructure Pro (5 hosts) | 5 x $15 | $75 |
| Container overage | 40 containers - 25 allotment (Pro) = 15 x $1.49 | $22 |
| APM (5 hosts) | 5 x $31 | $155 |
| Logs (6 GB/day, 11M events/day) | $18 ingestion + $561 indexing | $579 |
| Custom metrics (2,700 - 500 allotment) | 2,200 x $0.05 | $110 |
| RUM Measure (72K sessions) | 72 x $0.15 | $11 |
| Synthetics (moderate) | ~200K API + ~8K browser runs | $122 |
| Database Monitoring (1 host) | 1 x $70 | $70 |
| **TOTAL** | | **~$1,144/month** |
| **Annual** | | **~$13,728/year** |

### Profile B: Mid-Size Team (8 Microservices on K8s)

**Infrastructure:**
- 15 Kubernetes nodes
- 60 application pods (+ sidecars = 120 containers)
- 8 microservices + ingress + 2 worker services
- 3 databases (PostgreSQL, Redis, Elasticsearch)
- ~500 requests/sec combined
- B2B SaaS with 10,000 DAU

| Cost Category | Calculation | Monthly Cost |
|--------------|-------------|-------------|
| Infrastructure Enterprise (15 hosts) | 15 x $23 | $345 |
| Container overage | 120 containers - 150 allotment (Ent) = 0 | $0 |
| APM Enterprise (15 hosts) | 15 x $40 | $600 |
| Logs (25 GB/day, 50M events/day) | $75 ingestion + $2,550 indexing | $2,625 |
| Custom metrics (8,000 - 3,000 allotment) | 5,000 x $0.05 | $250 |
| RUM Measure + Replay 10% (360K sessions) | $54 + $90 | $144 |
| Synthetics | ~500K API + ~20K browser runs | $490 |
| Database Monitoring (3 hosts) | 3 x $70 | $210 |
| Error Tracking (200K errors) | $25 base + $37.50 | $63 |
| **TOTAL** | | **~$4,727/month** |
| **Annual** | | **~$56,724/year** |

### Profile C: Large Enterprise (from Coralogix analysis, 500 hosts)

**Three realistic scenarios (annual costs):**

| Scenario | Focus | Annual Cost |
|----------|-------|------------|
| Metrics-heavy (250K custom metrics, full APM) | Prometheus migration | **$1,257,000** |
| Log-heavy (45TB logs/month, 500 hosts) | Compliance/audit | **$11,418,000** |
| Balanced (10TB logs, 350 APM hosts, DB monitoring) | Typical enterprise | **$954,000** |

---

## 9. HOW SCALING AFFECTS COSTS

### Cost Scaling Matrix

| When This Doubles... | These Costs Scale... | Scaling Factor |
|---------------------|---------------------|---------------|
| **Number of K8s nodes** | Infrastructure hosts | ~2x (linear) |
| | APM hosts | ~2x (linear) |
| | Container allotment | Increases (may reduce overage) |
| | Custom metrics (host tag) | ~2x (linear, due to host tag) |
| | Logs | No change (traffic-driven) |
| **Request traffic (rps)** | Logs | ~2x (linear) |
| | APM ingested spans | ~2x (linear, before sampling) |
| | APM indexed spans | ~2x (linear) |
| | Error tracking events | ~2x (linear) |
| | Infrastructure hosts | No change |
| **Number of services** | Custom metric names | ~linear per service |
| | APM hosts (if new nodes needed) | Depends |
| | Synthetics tests | ~linear (more endpoints) |
| | Logs | ~linear per service |
| **Number of users** | RUM sessions | ~linear |
| | Synthetics | No change |
| | Backend traffic | Depends on usage patterns |
| **Tag cardinality** | Custom metrics | **Multiplicative (exponential)** |
| | Log storage (bytes) | ~1.5-2x per doubling of tags |

### Key Scaling Insights

**Linear scalers (predictable):**
- Host counts track infrastructure linearly
- Log volume tracks traffic linearly
- RUM sessions track users linearly
- Synthetics are static (manual configuration)

**Super-linear scalers (surprise bills):**
- **Custom metrics**: Adding one high-cardinality tag can multiply costs 10-1000x
- **Log indexing with retention**: Extending from 15-day to 30-day retention adds ~47% to indexing cost
- **High-water mark billing**: Brief autoscaling spikes are billed for the full month

**Sub-linear scalers (efficiency):**
- Container allotments grow with hosts (more hosts = more free containers)
- APM span allotments grow with hosts (more hosts = more free spans)
- Volume discounts at scale (500+ hosts, 3B+ log events)

### The "Double Traffic" Scenario

Starting point: Team Profile A ($1,144/month)

If traffic doubles from 100 rps to 200 rps:

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Infrastructure hosts | $75 | $75 (same nodes) | 0% |
| Containers | $22 | $22 (same pods) | 0% |
| APM hosts | $155 | $155 (same nodes) | 0% |
| APM span overage | $0 | $0 (still within allotment at 2x) | 0% |
| Logs | $579 | ~$1,100 (2x volume) | +90% |
| Custom metrics | $110 | $110 (same cardinality) | 0% |
| RUM | $11 | $22 (if 2x users) | +100% |
| Synthetics | $122 | $122 (same config) | 0% |
| Database Monitoring | $70 | $70 (same DB) | 0% |
| **TOTAL** | **$1,144** | **~$1,676** | **+46%** |

**Logs are the primary cost that scales with traffic.** Infrastructure costs are stable until you need more nodes.

### The "Need More Nodes" Scenario

If the 5-node cluster needs to scale to 10 nodes:

| Category | Before (5 nodes) | After (10 nodes) | Change |
|----------|-----------------|-------------------|--------|
| Infrastructure | $75 | $150 | +100% |
| Containers | $22 | $0 (more allotment) | -100% |
| APM | $155 | $310 | +100% |
| Custom metrics | $110 | ~$165 (host tag doubles) | +50% |
| **Infrastructure subtotal** | **$362** | **$625** | **+73%** |

---

## 10. QUICK REFERENCE: COST-PER-UNIT CHEAT SHEET (Annual Pricing)

| Dimension | Unit | Cost | Notes |
|-----------|------|------|-------|
| K8s node | per host/mo | $15-$40 | Depends on tier + APM |
| Container (over allotment) | per container/mo | ~$1.49 | $0.002/hr on-demand |
| Fargate task | per task/mo | $2.60 | APM Enterprise |
| Log ingestion | per GB | $0.10 | All traffic |
| Log indexing (15-day) | per 1M events | $1.70 | Per event, not per GB |
| Ingested span overage | per GB | $0.10 | Above 150 GB/host |
| Indexed span overage | per 1M spans (15-day) | $1.70 | Above 1M/host |
| Custom metric overage | per metric/mo | $0.05 | Above 100-200/host |
| RUM session | per 1K sessions | $0.15-$3.00 | Depends on tier |
| Session Replay | per 1K sessions | $2.50 | Add-on |
| Synthetics API run | per 10K runs | $5.00 | $0.0005/run |
| Synthetics browser run | per 1K runs | $12.00 | $0.012/run |
| Database host | per host/mo | $70 | |
| Error event | per 1K errors | $0.10-$0.25 | Volume-tiered |

---

*Sources: Datadog official documentation (docs.datadoghq.com), Datadog pricing page (datadoghq.com/pricing), BetterStack, SigNoz, Coralogix, OpenObserve, OneUptime, Middleware, Sedai, Last9, Checkly, Finout, Vantage, and web analytics benchmarks from Databox/Littledata.*
