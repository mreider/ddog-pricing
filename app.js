// ============================================================
// PRICING DATA
// ============================================================
const PRICING = {
  infrastructure: {
    pro: { annual: 15, onDemand: 18 }, enterprise: { annual: 23, onDemand: 27 },
    includedContainers: { pro: 5, enterprise: 10 },
    includedMetrics: { pro: 100, enterprise: 200 }
  },
  apm: {
    base: { annual: 31, onDemand: 36 }, pro: { annual: 35, onDemand: 42 }, enterprise: { annual: 40, onDemand: 48 }
  },
  logs: {
    ingestionPerGB: 0.10,
    indexing: { 3: { annual: 1.06, onDemand: 1.59 }, 7: { annual: 1.27, onDemand: 1.91 }, 15: { annual: 1.70, onDemand: 2.55 }, 30: { annual: 2.50, onDemand: 3.75 } }
  },
  containers: { prepaid: 1.00, onDemandMonthly: 1.49 },
  customMetrics: { per100: 5.00 },
  synthetics: { apiPer10K: { annual: 5, onDemand: 7.20 }, browserPer1K: { annual: 12, onDemand: 18 } },
  rum: { sessionsPer1K: { annual: 0.80, onDemand: 1.20 }, replayPer1K: { annual: 2.50, onDemand: 3.60 } },
  dbm: { perHost: { annual: 70, onDemand: 84 } },
  network: { cloudPerHost: { annual: 5, onDemand: 7.20 } },
  security: { pro: { annual: 10, onDemand: 12 }, enterprise: { annual: 25, onDemand: 30 } }
};

// ============================================================
// NODE TYPES
// ============================================================
const NODE_TYPES = {
  't3.medium':   { vcpu: 2, ram: 4, maxPods: 17 },
  't3.large':    { vcpu: 2, ram: 8, maxPods: 35 },
  't3.xlarge':   { vcpu: 4, ram: 16, maxPods: 58 },
  'm5.large':    { vcpu: 2, ram: 8, maxPods: 29 },
  'm5.xlarge':   { vcpu: 4, ram: 16, maxPods: 58 },
  'm5.2xlarge':  { vcpu: 8, ram: 32, maxPods: 58 },
  'r5.large':    { vcpu: 2, ram: 16, maxPods: 29 },
  'r5.xlarge':   { vcpu: 4, ram: 32, maxPods: 58 },
  'c5.xlarge':   { vcpu: 4, ram: 8, maxPods: 58 },
  'e2-standard-4': { vcpu: 4, ram: 16, maxPods: 32 },
  'e2-standard-8': { vcpu: 8, ram: 32, maxPods: 32 },
};

// Log volume estimates per request by runtime and log level
const LOG_EST = {
  java:   { ERROR: 0.3, WARN: 0.8, INFO: 4, DEBUG: 20 },
  nodejs: { ERROR: 0.2, WARN: 0.5, INFO: 2.5, DEBUG: 12 },
  go:     { ERROR: 0.15, WARN: 0.4, INFO: 1.5, DEBUG: 8 },
  python: { ERROR: 0.3, WARN: 0.7, INFO: 3, DEBUG: 15 },
};
const LOG_SIZE_KB = { java: 1.5, nodejs: 1.0, go: 0.7, python: 1.2 };

const TEAM_COLORS = ['#632CA6','#2563EB','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#EA580C'];
const PRODUCT_NAMES = {
  infra:'Infrastructure', apm:'APM', logs:'Log Management', containers:'Containers',
  metrics:'Custom Metrics', synthetics:'Synthetics', rum:'RUM', dbm:'Database Mon',
  network:'Network', security:'Security'
};

// ============================================================
// STATE
// ============================================================
let model = null;       // parsed YAML model
let dims = null;        // derived billing dimensions
let costs = null;       // calculated costs
let billingType = 'annual';
let breakdownChart = null;
let growthChart = null;
let selectedService = null;

// ============================================================
// PRESETS (YAML strings)
// ============================================================
const PRESETS = {
startup: `teams:
  - name: Engineering
    cluster:
      nodes: 3
      node_type: t3.large
    services:
      - name: api-gateway
        type: http
        runtime: nodejs
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 50
        log_level: INFO
        custom_metric_names: 20
        avg_tag_cardinality: 10
        calls: [user-service]
      - name: user-service
        type: http
        runtime: nodejs
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 50
        log_level: INFO
        custom_metric_names: 15
        avg_tag_cardinality: 10
        calls: [postgres]
      - name: postgres
        type: database
        system: postgresql
        instances: 1
`,

midmarket: `teams:
  - name: Platform
    cluster:
      nodes: 5
      node_type: m5.xlarge
    services:
      - name: api-gateway
        type: http
        runtime: java
        replicas: 3
        containers_per_pod: 2
        traffic_rps: 500
        log_level: INFO
        custom_metric_names: 40
        avg_tag_cardinality: 25
        calls: [auth-service, checkout-api, product-catalog]
      - name: auth-service
        type: http
        runtime: go
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 500
        log_level: WARN
        custom_metric_names: 15
        avg_tag_cardinality: 10
        calls: [redis]

  - name: Commerce
    cluster:
      nodes: 5
      node_type: m5.xlarge
    services:
      - name: checkout-api
        type: http
        runtime: java
        replicas: 3
        containers_per_pod: 2
        traffic_rps: 200
        log_level: INFO
        custom_metric_names: 50
        avg_tag_cardinality: 30
        calls: [payment-service, inventory-service, order-db]
      - name: payment-service
        type: http
        runtime: java
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 200
        log_level: INFO
        custom_metric_names: 30
        avg_tag_cardinality: 20
      - name: inventory-service
        type: http
        runtime: nodejs
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 300
        log_level: INFO
        custom_metric_names: 20
        avg_tag_cardinality: 15
        calls: [order-db, redis]
      - name: order-db
        type: database
        system: postgresql
        instances: 2
      - name: redis
        type: cache
        system: redis
        instances: 1

  - name: Product
    cluster:
      nodes: 3
      node_type: m5.large
    services:
      - name: product-catalog
        type: http
        runtime: java
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 300
        log_level: INFO
        custom_metric_names: 25
        avg_tag_cardinality: 20
        calls: [search-service, elasticsearch]
      - name: search-service
        type: http
        runtime: python
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 200
        log_level: INFO
        custom_metric_names: 15
        avg_tag_cardinality: 10
        calls: [elasticsearch]
      - name: elasticsearch
        type: database
        system: elasticsearch
        instances: 3
`,

enterprise: `teams:
  - name: Platform
    cluster:
      nodes: 10
      node_type: m5.2xlarge
    services:
      - name: api-gateway
        type: http
        runtime: java
        replicas: 6
        containers_per_pod: 2
        traffic_rps: 2000
        log_level: INFO
        custom_metric_names: 60
        avg_tag_cardinality: 40
        calls: [auth-service, rate-limiter, checkout-api, product-catalog, analytics-ingest]
      - name: auth-service
        type: http
        runtime: go
        replicas: 4
        containers_per_pod: 1
        traffic_rps: 2000
        log_level: WARN
        custom_metric_names: 20
        avg_tag_cardinality: 15
        calls: [user-db]
      - name: rate-limiter
        type: http
        runtime: go
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 2000
        log_level: ERROR
        custom_metric_names: 10
        avg_tag_cardinality: 10
        calls: [redis-cluster]
      - name: user-db
        type: database
        system: postgresql
        instances: 2
      - name: redis-cluster
        type: cache
        system: redis
        instances: 3

  - name: Commerce
    cluster:
      nodes: 15
      node_type: m5.xlarge
    services:
      - name: checkout-api
        type: http
        runtime: java
        replicas: 5
        containers_per_pod: 2
        traffic_rps: 800
        log_level: INFO
        custom_metric_names: 60
        avg_tag_cardinality: 35
        calls: [payment-service, inventory-service, order-db, notification-queue]
      - name: payment-service
        type: http
        runtime: java
        replicas: 4
        containers_per_pod: 2
        traffic_rps: 800
        log_level: INFO
        custom_metric_names: 40
        avg_tag_cardinality: 25
        calls: [payment-db]
      - name: inventory-service
        type: http
        runtime: nodejs
        replicas: 3
        containers_per_pod: 1
        traffic_rps: 1000
        log_level: INFO
        custom_metric_names: 30
        avg_tag_cardinality: 20
        calls: [order-db, redis-cache]
      - name: notification-queue
        type: messaging
        system: kafka
        instances: 3
      - name: order-db
        type: database
        system: postgresql
        instances: 3
      - name: payment-db
        type: database
        system: postgresql
        instances: 2
      - name: redis-cache
        type: cache
        system: redis
        instances: 2

  - name: Product
    cluster:
      nodes: 8
      node_type: m5.xlarge
    services:
      - name: product-catalog
        type: http
        runtime: java
        replicas: 4
        containers_per_pod: 2
        traffic_rps: 1200
        log_level: INFO
        custom_metric_names: 35
        avg_tag_cardinality: 25
        calls: [search-service, recommendation-svc, product-db]
      - name: search-service
        type: http
        runtime: python
        replicas: 3
        containers_per_pod: 1
        traffic_rps: 800
        log_level: INFO
        custom_metric_names: 20
        avg_tag_cardinality: 15
        calls: [elasticsearch]
      - name: recommendation-svc
        type: http
        runtime: python
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 600
        log_level: INFO
        custom_metric_names: 25
        avg_tag_cardinality: 20
        calls: [product-db]
      - name: elasticsearch
        type: database
        system: elasticsearch
        instances: 5
      - name: product-db
        type: database
        system: postgresql
        instances: 2

  - name: Data
    cluster:
      nodes: 6
      node_type: r5.xlarge
    services:
      - name: analytics-ingest
        type: http
        runtime: go
        replicas: 3
        containers_per_pod: 1
        traffic_rps: 500
        log_level: WARN
        custom_metric_names: 15
        avg_tag_cardinality: 10
        calls: [analytics-kafka]
      - name: analytics-kafka
        type: messaging
        system: kafka
        instances: 3
      - name: analytics-worker
        type: http
        runtime: python
        replicas: 4
        containers_per_pod: 1
        traffic_rps: 300
        log_level: INFO
        custom_metric_names: 20
        avg_tag_cardinality: 15
        calls: [analytics-db]
      - name: analytics-db
        type: database
        system: postgresql
        instances: 2

  - name: SRE
    cluster:
      nodes: 3
      node_type: t3.xlarge
    services:
      - name: status-page
        type: http
        runtime: go
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 20
        log_level: INFO
        custom_metric_names: 10
        avg_tag_cardinality: 5
      - name: alerting-service
        type: http
        runtime: go
        replicas: 2
        containers_per_pod: 1
        traffic_rps: 50
        log_level: INFO
        custom_metric_names: 15
        avg_tag_cardinality: 10
        calls: [notification-queue]
`
};

// ============================================================
// HELPERS
// ============================================================
function $(id) { return document.getElementById(id); }
function val(id) { const el = $(id); return el ? (parseFloat(el.value) || 0) : 0; }
function chk(id) { const el = $(id); return el ? el.checked : false; }
function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function fmtK(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toString(); }
function price(obj) { return obj[billingType] || obj.annual; }

// ============================================================
// YAML <-> MODEL
// ============================================================
function loadYaml(yamlStr) {
  try {
    const parsed = jsyaml.load(yamlStr);
    if (!parsed || !parsed.teams) throw new Error('Missing "teams" key');
    model = parsed;
    $('yamlError').classList.remove('visible');
    return true;
  } catch (e) {
    $('yamlError').textContent = e.message;
    $('yamlError').classList.add('visible');
    return false;
  }
}

function modelToYaml() {
  if (!model) return '';
  return jsyaml.dump(model, { lineWidth: 120, noRefs: true, quotingType: '"' });
}

// ============================================================
// DERIVE BILLING DIMENSIONS
// ============================================================
function deriveDimensions() {
  if (!model) return null;
  const mult = val('trafficMultiplier') || 1;
  const infraTier = $('dd-infra-tier').value;
  const d = {
    hosts: 0, containers: 0, containerAllotment: 0, containerOverage: 0,
    logGBPerDay: 0, logEventsPerDay: 0, logGBPerMonth: 0, logEventsPerMonth: 0,
    customMetrics: 0, metricAllotment: 0, metricOverage: 0,
    dbHosts: 0, httpServices: 0, totalServices: 0,
    teamBreakdown: [], serviceDetails: []
  };

  const contPerHost = PRICING.infrastructure.includedContainers[infraTier];
  const metPerHost = PRICING.infrastructure.includedMetrics[infraTier];

  for (let ti = 0; ti < model.teams.length; ti++) {
    const team = model.teams[ti];
    const nodes = team.cluster?.nodes || 0;
    const nodeType = team.cluster?.node_type || 't3.large';
    const nodeSpec = NODE_TYPES[nodeType] || { vcpu: 2, ram: 8, maxPods: 30 };

    let teamContainers = 0, teamLogs = 0, teamMetrics = 0, teamPods = 0;

    d.hosts += nodes;

    for (const svc of team.services || []) {
      d.totalServices++;
      const detail = { name: svc.name, team: team.name, teamIdx: ti, type: svc.type };

      if (svc.type === 'database' || svc.type === 'cache' || svc.type === 'messaging') {
        d.dbHosts += (svc.instances || 1);
        detail.containers = 0;
        detail.logGB = 0;
        detail.metrics = 0;
      } else {
        d.httpServices++;
        const reps = svc.replicas || 1;
        const cpp = svc.containers_per_pod || 1;
        const containers = reps * cpp;
        teamContainers += containers;
        teamPods += reps;

        const rps = (svc.traffic_rps || 0) * mult;
        const runtime = svc.runtime || 'nodejs';
        const level = svc.log_level || 'INFO';
        const lpr = (LOG_EST[runtime] && LOG_EST[runtime][level]) || 2;
        const sizeKB = LOG_SIZE_KB[runtime] || 1.0;
        const eventsPerDay = rps * lpr * 86400;
        const gbPerDay = eventsPerDay * sizeKB / 1e6;

        teamLogs += gbPerDay;
        d.logGBPerDay += gbPerDay;
        d.logEventsPerDay += eventsPerDay;

        const metricNames = svc.custom_metric_names || 0;
        const tagCard = svc.avg_tag_cardinality || 1;
        const svcMetrics = metricNames * tagCard;
        teamMetrics += svcMetrics;
        d.customMetrics += svcMetrics;

        detail.replicas = reps;
        detail.containers = containers;
        detail.traffic_rps = rps;
        detail.logGB = gbPerDay;
        detail.logEvents = eventsPerDay;
        detail.metrics = svcMetrics;
      }
      d.serviceDetails.push(detail);
    }

    // DaemonSet pods (agent, log shipper)
    teamContainers += nodes;
    d.containers += teamContainers;

    const utilPct = nodeSpec.maxPods > 0 ? Math.round(teamPods / (nodes * nodeSpec.maxPods) * 100) : 0;

    d.teamBreakdown.push({
      name: team.name, color: TEAM_COLORS[ti % TEAM_COLORS.length],
      nodes, nodeType, containers: teamContainers, pods: teamPods,
      logGBPerDay: teamLogs, metrics: teamMetrics, utilPct
    });
  }

  d.containerAllotment = d.hosts * contPerHost;
  d.containerOverage = Math.max(0, d.containers - d.containerAllotment);
  d.metricAllotment = d.hosts * metPerHost;
  d.metricOverage = Math.max(0, d.customMetrics - d.metricAllotment);
  d.logGBPerMonth = d.logGBPerDay * 30;
  d.logEventsPerMonth = d.logEventsPerDay * 30;

  return d;
}

// ============================================================
// CALCULATE COSTS
// ============================================================
function calculateCosts() {
  if (!dims) return null;
  const discount = val('discount') / 100;
  const c = {};

  if (chk('dd-infra')) {
    c.infra = dims.hosts * price(PRICING.infrastructure[$('dd-infra-tier').value]);
  } else c.infra = 0;

  if (chk('dd-apm')) {
    c.apm = dims.hosts * price(PRICING.apm[$('dd-apm-tier').value]);
  } else c.apm = 0;

  if (chk('dd-logs')) {
    const ret = $('dd-logs-ret').value;
    const indexPrice = price(PRICING.logs.indexing[ret]);
    c.logs = dims.logGBPerMonth * PRICING.logs.ingestionPerGB + (dims.logEventsPerMonth / 1e6) * indexPrice;
  } else c.logs = 0;

  if (chk('dd-containers')) {
    c.containers = dims.containerOverage * PRICING.containers.prepaid;
  } else c.containers = 0;

  if (chk('dd-metrics')) {
    c.metrics = Math.ceil(dims.metricOverage / 100) * PRICING.customMetrics.per100;
  } else c.metrics = 0;

  if (chk('dd-synthetics')) {
    const apiEndpoints = dims.httpServices * 2;
    const apiRuns = apiEndpoints * (1440 / 5) * 3 * 30; // 5-min interval, 3 locations
    const browserRuns = 2 * (1440 / 15) * 2 * 30; // 2 flows, 15-min, 2 locations
    c.synthetics = (apiRuns / 10000) * price(PRICING.synthetics.apiPer10K) +
                   (browserRuns / 1000) * price(PRICING.synthetics.browserPer1K);
  } else c.synthetics = 0;

  if (chk('dd-rum')) {
    const dau = val('dd-rum-dau');
    const spd = val('dd-rum-spd') || 1.2;
    const replayPct = val('dd-rum-replay') || 0;
    const sessions = dau * spd * 30;
    c.rum = (sessions / 1000) * price(PRICING.rum.sessionsPer1K);
    if (replayPct > 0) {
      c.rum += (sessions * replayPct / 100 / 1000) * price(PRICING.rum.replayPer1K);
    }
  } else c.rum = 0;

  if (chk('dd-dbm')) {
    c.dbm = dims.dbHosts * price(PRICING.dbm.perHost);
  } else c.dbm = 0;

  if (chk('dd-network')) {
    c.network = dims.hosts * price(PRICING.network.cloudPerHost);
  } else c.network = 0;

  if (chk('dd-security')) {
    c.security = dims.hosts * price(PRICING.security[$('dd-security-tier').value]);
  } else c.security = 0;

  // Apply discount
  let total = 0;
  for (const k in c) { c[k] *= (1 - discount); total += c[k]; }
  c._total = total;

  return c;
}

function calculateOnDemandTotal() {
  if (!dims) return 0;
  const discount = val('discount') / 100;
  let t = 0;
  if (chk('dd-infra')) t += dims.hosts * PRICING.infrastructure[$('dd-infra-tier').value].onDemand;
  if (chk('dd-apm')) t += dims.hosts * PRICING.apm[$('dd-apm-tier').value].onDemand;
  if (chk('dd-logs')) {
    const ret = $('dd-logs-ret').value;
    t += dims.logGBPerMonth * PRICING.logs.ingestionPerGB + (dims.logEventsPerMonth / 1e6) * PRICING.logs.indexing[ret].onDemand;
  }
  if (chk('dd-containers')) t += dims.containerOverage * PRICING.containers.onDemandMonthly;
  if (chk('dd-metrics')) t += Math.ceil(dims.metricOverage / 100) * PRICING.customMetrics.per100;
  if (chk('dd-synthetics')) {
    const apiRuns = dims.httpServices * 2 * (1440/5) * 3 * 30;
    const browserRuns = 2 * (1440/15) * 2 * 30;
    t += (apiRuns/10000) * PRICING.synthetics.apiPer10K.onDemand + (browserRuns/1000) * PRICING.synthetics.browserPer1K.onDemand;
  }
  if (chk('dd-rum')) {
    const sessions = val('dd-rum-dau') * (val('dd-rum-spd')||1.2) * 30;
    t += (sessions/1000) * PRICING.rum.sessionsPer1K.onDemand;
    const rp = val('dd-rum-replay');
    if (rp > 0) t += (sessions*rp/100/1000) * PRICING.rum.replayPer1K.onDemand;
  }
  if (chk('dd-dbm')) t += dims.dbHosts * PRICING.dbm.perHost.onDemand;
  if (chk('dd-network')) t += dims.hosts * PRICING.network.cloudPerHost.onDemand;
  if (chk('dd-security')) t += dims.hosts * PRICING.security[$('dd-security-tier').value].onDemand;
  return t * (1 - discount);
}

// ============================================================
// UPDATE UI
// ============================================================
function recalculate() {
  $('discountValue').textContent = val('discount') + '%';
  $('trafficLabel').textContent = (val('trafficMultiplier') || 1).toFixed(1) + 'x';

  dims = deriveDimensions();
  costs = calculateCosts();
  if (!costs) return;

  // Product costs
  for (const k in PRODUCT_NAMES) {
    const el = $('cost-' + k);
    if (el) el.textContent = costs[k] > 0 ? fmt(costs[k]) : '-';
  }

  // Totals
  $('totalMonthly').textContent = fmt(costs._total);
  $('totalAnnual').textContent = fmt(costs._total * 12);

  // Savings
  if (billingType === 'annual' && costs._total > 0) {
    const od = calculateOnDemandTotal();
    const saving = (od - costs._total) * 12;
    if (saving > 0) {
      $('savingsCard').style.display = 'block';
      $('savingsAmount').textContent = fmt(saving) + '/yr';
      $('savingsPct').textContent = ((od - costs._total) / od * 100).toFixed(1) + '% less than on-demand';
    } else $('savingsCard').style.display = 'none';
  } else $('savingsCard').style.display = 'none';

  // Infra summary
  $('sb-hosts').textContent = dims.hosts;
  $('sb-containers').textContent = dims.containers + ' (allot: ' + dims.containerAllotment + ')';
  $('sb-container-over').textContent = dims.containerOverage;
  $('sb-logs').textContent = dims.logGBPerDay.toFixed(1) + ' GB/day';
  $('sb-events').textContent = fmtK(Math.round(dims.logEventsPerMonth)) + '/mo';
  $('sb-metrics').textContent = fmtK(dims.customMetrics);
  $('sb-metric-over').textContent = fmtK(dims.metricOverage);
  $('sb-db').textContent = dims.dbHosts;
  $('sb-services').textContent = dims.httpServices;

  // Team costs
  updateTeamCosts();
  updateBreakdownChart();
  updateDimCards();
  updateGrowthChart();
}

function updateTeamCosts() {
  if (!dims) return;
  let html = '<h5>Cost by Team</h5>';
  for (const t of dims.teamBreakdown) {
    // Rough per-team cost: proportional by hosts
    const hostShare = dims.hosts > 0 ? t.nodes / dims.hosts : 0;
    const teamCost = costs._total * hostShare;
    html += `<div class="sb-team-row">
      <span><span class="team-dot" style="background:${t.color}"></span>${t.name}</span>
      <span>${fmt(teamCost)}/mo</span>
    </div>`;
  }
  $('teamCosts').innerHTML = html;
}

function updateBreakdownChart() {
  const data = [], labels = [], colors = [];
  const palette = ['#632CA6','#8B5CF6','#A78BFA','#2563EB','#3B82F6','#059669','#10B981','#D97706','#DC2626','#7C3AED'];
  let i = 0;
  for (const k in PRODUCT_NAMES) {
    if (costs[k] > 0) {
      data.push(Math.round(costs[k]));
      labels.push(PRODUCT_NAMES[k]);
      colors.push(palette[i % palette.length]);
    }
    i++;
  }
  if (breakdownChart) {
    breakdownChart.data.labels = labels;
    breakdownChart.data.datasets[0].data = data;
    breakdownChart.data.datasets[0].backgroundColor = colors;
    breakdownChart.update();
  } else {
    breakdownChart = new Chart($('breakdownChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 6 } },
          tooltip: { callbacks: { label: ctx => {
            const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
            return ctx.label + ': ' + fmt(ctx.raw) + ' (' + (ctx.raw/total*100).toFixed(1) + '%)';
          }}}
        }
      }
    });
  }
}

// ============================================================
// CALCULATOR TAB - DIMENSION CARDS
// ============================================================
function updateDimCards() {
  if (!dims) return;
  const tier = $('dd-infra-tier').value;
  const ret = $('dd-logs-ret').value;

  let html = '';

  // Infrastructure
  let teamDetail = dims.teamBreakdown.map(t =>
    `<span style="color:${t.color}">${t.name}</span>: ${t.nodes} × ${t.nodeType}`
  ).join('<br>');
  html += dimCard('Infrastructure Hosts', dims.hosts, 'hosts', teamDetail,
    chk('dd-infra') ? fmt(costs.infra) + '/mo' : 'disabled');

  // Containers
  let contDetail = dims.teamBreakdown.map(t =>
    `<span style="color:${t.color}">${t.name}</span>: ${t.containers} containers (${t.pods} pods, ${t.utilPct}% node capacity)`
  ).join('<br>');
  contDetail += `<br>Allotment: ${dims.containerAllotment} (${PRICING.infrastructure.includedContainers[tier]}/host)`;
  html += dimCard('Containers', dims.containers, 'total', contDetail,
    chk('dd-containers') ? fmt(costs.containers) + '/mo (overage: ' + dims.containerOverage + ')' : 'disabled');

  // Logs
  let logDetail = '';
  const httpDetails = dims.serviceDetails.filter(s => s.type === 'http');
  httpDetails.sort((a,b) => b.logGB - a.logGB);
  for (const s of httpDetails.slice(0, 5)) {
    logDetail += `${s.name}: ${s.logGB.toFixed(1)} GB/day (${fmtK(Math.round(s.logEvents))} events)<br>`;
  }
  if (httpDetails.length > 5) logDetail += `...and ${httpDetails.length - 5} more services`;
  logDetail += `<br><strong>Ingestion</strong>: ${dims.logGBPerMonth.toFixed(0)} GB × $0.10 = ${fmt(dims.logGBPerMonth * 0.10)}`;
  logDetail += `<br><strong>Indexing</strong>: ${fmtK(Math.round(dims.logEventsPerMonth))} events × $${price(PRICING.logs.indexing[ret]).toFixed(2)}/M = ${fmt(dims.logEventsPerMonth / 1e6 * price(PRICING.logs.indexing[ret]))}`;
  html += dimCard('Log Management', dims.logGBPerDay.toFixed(1), 'GB/day', logDetail,
    chk('dd-logs') ? fmt(costs.logs) + '/mo' : 'disabled');

  // Custom Metrics
  let metDetail = '';
  const metDetails = dims.serviceDetails.filter(s => s.metrics > 0).sort((a,b) => b.metrics - a.metrics);
  for (const s of metDetails.slice(0, 5)) {
    metDetail += `${s.name}: ${fmtK(s.metrics)} metrics<br>`;
  }
  metDetail += `<br>Allotment: ${fmtK(dims.metricAllotment)} (${PRICING.infrastructure.includedMetrics[tier]}/host)`;
  metDetail += `<br>Overage: ${fmtK(dims.metricOverage)} × $0.05 = ${fmt(dims.metricOverage * 0.05)}`;
  html += dimCard('Custom Metrics', fmtK(dims.customMetrics), 'total', metDetail,
    chk('dd-metrics') ? fmt(costs.metrics) + '/mo' : 'disabled');

  // APM
  html += dimCard('APM', dims.hosts, 'traced hosts', 'APM priced per K8s node. Includes 150 GB span ingestion + 1M indexed spans per host.',
    chk('dd-apm') ? fmt(costs.apm) + '/mo' : 'disabled');

  // DB Monitoring
  html += dimCard('Database Monitoring', dims.dbHosts, 'db hosts',
    dims.teamBreakdown.map(t => {
      const dbs = (model.teams[dims.teamBreakdown.indexOf(t)]?.services || []).filter(s => s.type === 'database' || s.type === 'cache');
      return dbs.length > 0 ? `<span style="color:${t.color}">${t.name}</span>: ${dbs.map(d => d.name + ' (' + (d.instances||1) + ')').join(', ')}` : '';
    }).filter(Boolean).join('<br>'),
    chk('dd-dbm') ? fmt(costs.dbm) + '/mo' : 'disabled');

  $('dimGrid').innerHTML = html;
}

function dimCard(title, value, unit, breakdown, costStr) {
  return `<div class="dim-card">
    <h4>${title}</h4>
    <div class="dim-main"><span style="font-size:20px;font-weight:700">${value}</span><span>${unit}</span></div>
    <div class="dim-breakdown">${breakdown}</div>
    <div class="dim-cost">${costStr}</div>
  </div>`;
}

// ============================================================
// TOPOLOGY RENDERING (D3.js)
// ============================================================
function renderTopology() {
  if (!model || !model.teams) return;
  const svg = d3.select('#topology');
  svg.selectAll('*').remove();
  const svgEl = svg.node();
  const W = svgEl.clientWidth || 800;
  const H = svgEl.clientHeight || 500;

  const g = svg.append('g');

  // Build service map and links
  const allServices = [];
  const allLinks = [];
  const serviceMap = {};

  for (let ti = 0; ti < model.teams.length; ti++) {
    const team = model.teams[ti];
    for (const svc of team.services || []) {
      const s = { ...svc, teamIdx: ti, teamName: team.name, teamColor: TEAM_COLORS[ti % TEAM_COLORS.length] };
      allServices.push(s);
      serviceMap[svc.name] = s;
    }
  }
  for (const svc of allServices) {
    for (const callName of svc.calls || []) {
      if (serviceMap[callName]) {
        allLinks.push({ source: svc.name, target: callName, crossTeam: svc.teamIdx !== serviceMap[callName].teamIdx });
      }
    }
  }

  // Layout: teams as columns, services layered within
  const nodeW = 150, nodeH = 55, gapH = 25, gapV = 70;
  const teamPad = 16, teamGap = 30, headerH = 35;
  const mult = val('trafficMultiplier') || 1;

  let teamLayouts = [];
  let curX = 0;

  for (let ti = 0; ti < model.teams.length; ti++) {
    const team = model.teams[ti];
    const svcs = allServices.filter(s => s.teamIdx === ti);
    const incomingInTeam = new Set();
    for (const s of svcs) {
      for (const c of s.calls || []) {
        if (svcs.find(x => x.name === c)) incomingInTeam.add(c);
      }
    }

    // Layer assignment
    const layers = [[], [], [], []];
    for (const s of svcs) {
      if (s.type === 'database' || s.type === 'cache') layers[3].push(s);
      else if (s.type === 'messaging') layers[2].push(s);
      else if (!incomingInTeam.has(s.name)) layers[0].push(s);
      else layers[1].push(s);
    }

    const usedLayers = layers.filter(l => l.length > 0);
    const maxInLayer = Math.max(1, ...layers.map(l => l.length));
    const colW = maxInLayer * nodeW + (maxInLayer - 1) * gapH + teamPad * 2;
    const colH = usedLayers.length * nodeH + (usedLayers.length - 1) * gapV + teamPad * 2 + headerH;

    let yOff = headerH + teamPad;
    for (let li = 0; li <= 3; li++) {
      if (layers[li].length === 0) continue;
      const lw = layers[li].length * nodeW + (layers[li].length - 1) * gapH;
      const startX = curX + teamPad + (colW - teamPad * 2 - lw) / 2;
      for (let si = 0; si < layers[li].length; si++) {
        layers[li][si]._x = startX + si * (nodeW + gapH) + nodeW / 2;
        layers[li][si]._y = yOff + nodeH / 2;
      }
      yOff += nodeH + gapV;
    }

    teamLayouts.push({ name: team.name, cluster: team.cluster, x: curX, y: 0, w: colW, h: colH, color: TEAM_COLORS[ti % TEAM_COLORS.length] });
    curX += colW + teamGap;
  }

  // Draw team backgrounds
  g.selectAll('.team-bg').data(teamLayouts).join('rect')
    .attr('class', 'team-bg')
    .attr('x', d => d.x).attr('y', d => d.y)
    .attr('width', d => d.w).attr('height', d => d.h)
    .style('fill', d => d.color + '08').style('stroke', d => d.color + '30');

  // Team labels
  g.selectAll('.team-label').data(teamLayouts).join('text')
    .attr('class', 'team-label').attr('x', d => d.x + 10).attr('y', d => d.y + 16)
    .text(d => d.name);
  g.selectAll('.team-info').data(teamLayouts).join('text')
    .attr('class', 'team-info').attr('x', d => d.x + 10).attr('y', d => d.y + 28)
    .text(d => `${d.cluster?.nodes || 0} × ${d.cluster?.node_type || '?'}`);

  // Arrow marker
  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -3 6 6').attr('refX', 5).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-3L6,0L0,3').attr('fill', '#aab');

  // Draw links
  g.selectAll('.link').data(allLinks).join('path')
    .attr('class', d => 'link' + (d.crossTeam ? ' cross-team' : ''))
    .attr('marker-end', 'url(#arrow)')
    .attr('d', d => {
      const s = serviceMap[d.source], t = serviceMap[d.target];
      if (!s?._x || !t?._x) return '';
      const sy = s._y + nodeH/2, ty = t._y - nodeH/2;
      const midY = (sy + ty) / 2;
      return `M ${s._x} ${sy} C ${s._x} ${midY}, ${t._x} ${midY}, ${t._x} ${ty}`;
    });

  // Draw nodes
  const nodes = g.selectAll('.node').data(allServices).join('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d._x}, ${d._y})`)
    .on('click', function(event, d) {
      d3.selectAll('.node').classed('selected', false);
      d3.selectAll('.link').classed('highlighted', false).classed('dimmed', false);
      d3.select(this).classed('selected', true);
      g.selectAll('.link')
        .classed('highlighted', l => l.source === d.name || l.target === d.name)
        .classed('dimmed', l => l.source !== d.name && l.target !== d.name);
      showServiceDetail(d);
    });

  // Node bg
  nodes.append('rect').attr('class', 'node-bg')
    .attr('x', -nodeW/2).attr('y', -nodeH/2).attr('width', nodeW).attr('height', nodeH);

  // Team accent bar
  nodes.append('rect').attr('class', 'node-accent')
    .attr('x', -nodeW/2).attr('y', -nodeH/2).attr('width', 4).attr('height', nodeH)
    .style('fill', d => d.teamColor);

  // Type badge
  const typeColors = { http: '#2563EB', database: '#7C3AED', cache: '#059669', messaging: '#D97706' };
  nodes.append('rect').attr('class', 'node-type-bg')
    .attr('x', nodeW/2 - 40).attr('y', -nodeH/2 + 4).attr('width', 36).attr('height', 14)
    .style('fill', d => typeColors[d.type] || '#666');
  nodes.append('text').attr('class', 'node-type-badge')
    .attr('x', nodeW/2 - 22).attr('y', -nodeH/2 + 14).attr('text-anchor', 'middle')
    .text(d => (d.type || '').toUpperCase().slice(0, 5));

  // Name
  nodes.append('text').attr('class', 'node-name')
    .attr('x', -nodeW/2 + 10).attr('y', -2)
    .text(d => d.name.length > 18 ? d.name.slice(0, 16) + '..' : d.name);

  // Info line
  nodes.append('text').attr('class', 'node-info')
    .attr('x', -nodeW/2 + 10).attr('y', 12)
    .text(d => {
      if (d.type === 'database' || d.type === 'cache' || d.type === 'messaging')
        return (d.system || d.type) + ' · ' + (d.instances || 1) + ' inst';
      return (d.runtime || '') + ' · ' + (d.replicas || 1) + 'r';
    });

  // Traffic badge
  nodes.append('text').attr('class', 'node-traffic')
    .attr('x', -nodeW/2 + 10).attr('y', nodeH/2 - 6)
    .text(d => {
      if (d.type !== 'http') return '';
      const rps = (d.traffic_rps || 0) * mult;
      return rps >= 1000 ? (rps/1000).toFixed(1) + 'K rps' : Math.round(rps) + ' rps';
    });

  // Auto-fit
  const bounds = g.node().getBBox();
  if (bounds.width > 0 && bounds.height > 0) {
    const scale = Math.min((W - 30) / bounds.width, (H - 30) / bounds.height, 1.3);
    const tx = (W - bounds.width * scale) / 2 - bounds.x * scale;
    const ty = (H - bounds.height * scale) / 2 - bounds.y * scale;
    g.attr('transform', `translate(${tx}, ${ty}) scale(${scale})`);
  }
}

function showServiceDetail(svc) {
  const detail = dims?.serviceDetails?.find(s => s.name === svc.name);
  const panel = $('serviceDetail');
  if (!detail) { panel.classList.remove('visible'); return; }

  panel.classList.add('visible');
  const mult = val('trafficMultiplier') || 1;

  let html = `<h4>${svc.name} <span style="color:${svc.teamColor};font-size:12px">${svc.teamName}</span></h4>`;
  html += '<div class="sd-grid">';

  if (svc.type === 'http') {
    html += sdItem('Traffic', Math.round((svc.traffic_rps||0)*mult) + ' rps');
    html += sdItem('Replicas', svc.replicas || 1);
    html += sdItem('Containers', detail.containers);
    html += sdItem('Logs', detail.logGB?.toFixed(1) + ' GB/day');
    html += sdItem('Log Events', fmtK(Math.round(detail.logEvents || 0)) + '/day');
    html += sdItem('Custom Metrics', fmtK(detail.metrics));
    html += sdItem('Runtime', svc.runtime);
    html += sdItem('Log Level', svc.log_level);
  } else {
    html += sdItem('Type', svc.system || svc.type);
    html += sdItem('Instances', svc.instances || 1);
  }

  if (svc.calls?.length) {
    html += sdItem('Calls', svc.calls.join(', '));
  }

  html += '</div>';
  panel.innerHTML = html;
}

function sdItem(label, value) {
  return `<div class="sd-item"><div class="sd-label">${label}</div><div class="sd-value">${value}</div></div>`;
}

// ============================================================
// GROWTH & HWM
// ============================================================
function updateGrowthChart() {
  const monthly = costs?._total || 0;
  const rate = val('growth-rate') / 100;
  const labels = [], data = [];
  let cum = 0;
  for (let i = 0; i < 12; i++) {
    const m = monthly * Math.pow(1 + rate, i);
    labels.push('M' + (i+1));
    data.push(Math.round(m));
    cum += m;
  }
  if (growthChart) {
    growthChart.data.labels = labels;
    growthChart.data.datasets[0].data = data;
    growthChart.update();
  } else {
    const ctx = $('growthChart');
    if (!ctx) return;
    growthChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Monthly', data, backgroundColor: '#632CA6', borderRadius: 3 }] },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(v) } } } }
    });
  }
  const gs = $('growthSummary');
  if (gs) gs.innerHTML = `M1: <strong>${fmt(data[0]||0)}</strong> → M12: <strong>${fmt(data[11]||0)}</strong><br>12-month total: <strong>${fmt(Math.round(cum))}</strong>` +
    (rate > 0 ? `<br>Growth: <strong>${Math.pow(1+rate,11).toFixed(1)}x</strong>` : '');
}

function updateHWM() {
  const normal = val('hwm-normal'), peak = val('hwm-peak'), hours = val('hwm-hours');
  const totalH = 730, top1 = Math.ceil(totalH * 0.01);
  const forgiven = hours <= top1;
  const billed = forgiven ? normal : peak;
  const infraPrice = price(PRICING.infrastructure[$('dd-infra-tier').value]);
  const normalBill = normal * infraPrice, actualBill = billed * infraPrice;

  let h = '';
  h += hwmRow('Hours/month', totalH);
  h += hwmRow('Top 1% forgiven', top1 + 'h');
  h += hwmRow('Peak duration', hours + 'h');
  h += hwmRow('Peak forgiven?', forgiven ? 'Yes' : 'No');
  h += hwmRow('Normal bill', fmt(normalBill) + '/mo');
  h += `<div class="hwm-row highlight"><span>Actual bill (${billed} hosts)</span><span>${fmt(actualBill)}/mo</span></div>`;
  if (!forgiven) {
    h += `<div class="hwm-row highlight"><span>Scaling event cost</span><span>+${fmt(actualBill - normalBill)}/mo</span></div>`;
  } else {
    h += `<div class="hwm-row good"><span>Peak fully forgiven by 99th pctile</span><span></span></div>`;
  }
  $('hwmResults').innerHTML = h;
}
function hwmRow(l, v) { return `<div class="hwm-row"><span>${l}</span><span>${v}</span></div>`; }

// ============================================================
// RUM detail toggle
// ============================================================
function toggleRumDetail() {
  $('rum-detail').style.display = chk('dd-rum') ? 'flex' : 'none';
}

// ============================================================
// TABS
// ============================================================
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === tabName + '-panel'));

  if (tabName === 'config') {
    $('yamlEditor').value = modelToYaml();
  }
  if (tabName === 'topology') {
    requestAnimationFrame(() => renderTopology());
  }
}

// ============================================================
// PRESETS
// ============================================================
function loadPreset(name) {
  const yaml = PRESETS[name];
  if (!yaml) return;
  if (loadYaml(yaml)) {
    // Set sensible sidebar defaults per preset
    if (name === 'startup') {
      $('dd-infra-tier').value = 'pro';
      $('dd-apm-tier').value = 'base';
      $('dd-logs-ret').value = '7';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-containers').checked = true; $('dd-metrics').checked = true;
      $('dd-synthetics').checked = false; $('dd-rum').checked = false;
      $('dd-dbm').checked = true; $('dd-network').checked = false; $('dd-security').checked = false;
      $('dd-rum-dau').value = 0; $('discount').value = 0;
    } else if (name === 'midmarket') {
      $('dd-infra-tier').value = 'enterprise';
      $('dd-apm-tier').value = 'enterprise';
      $('dd-logs-ret').value = '15';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-containers').checked = true; $('dd-metrics').checked = true;
      $('dd-synthetics').checked = true; $('dd-rum').checked = true;
      $('dd-dbm').checked = true; $('dd-network').checked = true; $('dd-security').checked = false;
      $('dd-rum-dau').value = 10000; $('dd-rum-spd').value = 1.2; $('dd-rum-replay').value = 10;
      $('discount').value = 15;
    } else if (name === 'enterprise') {
      $('dd-infra-tier').value = 'enterprise';
      $('dd-apm-tier').value = 'enterprise';
      $('dd-logs-ret').value = '30';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-containers').checked = true; $('dd-metrics').checked = true;
      $('dd-synthetics').checked = true; $('dd-rum').checked = true;
      $('dd-dbm').checked = true; $('dd-network').checked = true; $('dd-security').checked = true;
      $('dd-security-tier').value = 'enterprise';
      $('dd-rum-dau').value = 50000; $('dd-rum-spd').value = 1.3; $('dd-rum-replay').value = 10;
      $('discount').value = 25;
    }
    toggleRumDetail();
    $('trafficMultiplier').value = 1;
    recalculate();
    renderTopology();
  }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  // Tabs
  $('tabs').addEventListener('click', e => {
    if (e.target.classList.contains('tab')) switchTab(e.target.dataset.tab);
  });

  // Presets
  $('presets').addEventListener('click', e => {
    if (e.target.dataset.preset) loadPreset(e.target.dataset.preset);
  });

  // Billing toggle
  $('billingToggle').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.type) {
      billingType = e.target.dataset.type;
      $('billingToggle').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.type === billingType));
      recalculate();
    }
  });

  // Discount & traffic sliders
  $('discount').addEventListener('input', recalculate);
  $('trafficMultiplier').addEventListener('input', () => {
    recalculate();
    renderTopology();
  });

  // YAML editor (debounced)
  let yamlTimer;
  $('yamlEditor').addEventListener('input', () => {
    clearTimeout(yamlTimer);
    yamlTimer = setTimeout(() => {
      if (loadYaml($('yamlEditor').value)) {
        recalculate();
      }
    }, 600);
  });

  // Load mid-market by default
  loadPreset('midmarket');
  switchTab('topology');
  updateHWM();
});
