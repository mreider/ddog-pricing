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
  security: { pro: { annual: 10, onDemand: 12 }, enterprise: { annual: 25, onDemand: 30 } },
  errorTracking: {
    base: { annual: 25, onDemand: 36 }, // flat fee for first 50K
    tiers: [ // per 1K errors above 50K
      { max: 100000, annual: 0.25, onDemand: 0.38 },
      { max: 500000, annual: 0.21, onDemand: 0.32 },
      { max: 10000000, annual: 0.17, onDemand: 0.26 },
    ]
  },
  csiem: { perMEvents: { annual: 5, onDemand: 7.50 } },
  ciVisibility: { perCommitter: { annual: 8, onDemand: 12 } },
  incidents: { perSeat: { annual: 20, onDemand: 29 } },
  usm: { perHost: { annual: 9, onDemand: 13 } }
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
  infra:'Infrastructure', apm:'APM', logs:'Log Management',
  metrics:'Custom Metrics', synthetics:'Synthetics', rum:'RUM', dbm:'Database Mon',
  network:'Network', security:'Security', errorTracking:'Error Tracking',
  csiem:'Cloud SIEM', civis:'CI Visibility', incidents:'Incident Mgmt', usm:'Universal Svc Mon'
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

  if (chk('dd-errors')) {
    // Error rate ~2% of requests, estimate errors from total traffic
    const totalRPS = dims.serviceDetails.filter(s => s.type === 'http').reduce((sum, s) => sum + (s.traffic_rps || 0), 0);
    const errorsPerMonth = totalRPS * 0.02 * 86400 * 30;
    dims._errorsPerMonth = errorsPerMonth;
    c.errorTracking = price(PRICING.errorTracking.base);
    if (errorsPerMonth > 50000) {
      const over = errorsPerMonth - 50000;
      // Use first applicable tier
      const tier = PRICING.errorTracking.tiers.find(t => errorsPerMonth <= t.max) || PRICING.errorTracking.tiers[PRICING.errorTracking.tiers.length - 1];
      c.errorTracking += (over / 1000) * price(tier);
    }
  } else c.errorTracking = 0;

  if (chk('dd-csiem')) {
    // SIEM indexes security-relevant log events (~10% of total log events)
    const siemEvents = dims.logEventsPerMonth * 0.10;
    dims._siemEvents = siemEvents;
    c.csiem = (siemEvents / 1e6) * price(PRICING.csiem.perMEvents);
  } else c.csiem = 0;

  if (chk('dd-civis')) {
    const committers = val('dd-civis-committers') || 0;
    dims._committers = committers;
    c.civis = committers * price(PRICING.ciVisibility.perCommitter);
  } else c.civis = 0;

  if (chk('dd-incidents')) {
    const seats = val('dd-incidents-seats') || 0;
    dims._incidentSeats = seats;
    c.incidents = seats * price(PRICING.incidents.perSeat);
  } else c.incidents = 0;

  if (chk('dd-usm')) {
    c.usm = dims.hosts * price(PRICING.usm.perHost);
  } else c.usm = 0;

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
  if (chk('dd-errors')) {
    t += PRICING.errorTracking.base.onDemand;
    const errMo = dims._errorsPerMonth || 0;
    if (errMo > 50000) {
      const tier = PRICING.errorTracking.tiers.find(tr => errMo <= tr.max) || PRICING.errorTracking.tiers[PRICING.errorTracking.tiers.length - 1];
      t += ((errMo - 50000) / 1000) * tier.onDemand;
    }
  }
  if (chk('dd-csiem')) t += ((dims._siemEvents || 0) / 1e6) * PRICING.csiem.perMEvents.onDemand;
  if (chk('dd-civis')) t += (val('dd-civis-committers') || 0) * PRICING.ciVisibility.perCommitter.onDemand;
  if (chk('dd-incidents')) t += (val('dd-incidents-seats') || 0) * PRICING.incidents.perSeat.onDemand;
  if (chk('dd-usm')) t += dims.hosts * PRICING.usm.perHost.onDemand;
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
  const apmTier = $('dd-apm-tier').value;
  const ret = $('dd-logs-ret').value;
  const bl = billingType === 'annual' ? 'Annual' : 'On-Demand';
  const discount = val('discount') / 100;

  let html = '';

  // Infrastructure
  if (chk('dd-infra')) {
    const unitP = price(PRICING.infrastructure[tier]);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Tier</td><td>${tier === 'enterprise' ? 'Enterprise' : 'Pro'} (${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${unitP}/host/mo</td></tr>`;
    bd += `<tr><td>Hosts</td><td>${dims.hosts}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.hosts} hosts × $${unitP}</td><td><strong>${fmt(dims.hosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += dims.teamBreakdown.map(t => `<span style="color:${t.color}">${t.name}</span>: ${t.nodes} × ${t.nodeType}`).join(' · ');
    bd += `<div class="ps-note">Billing: 99th percentile of hourly host count. Includes ${PRICING.infrastructure.includedMetrics[tier]} custom metrics + ${PRICING.infrastructure.includedContainers[tier]} containers per host.</div>`;
    html += dimCard('Infrastructure Monitoring', fmt(costs.infra) + '/mo', bd);
  }

  // APM
  if (chk('dd-apm')) {
    const unitP = price(PRICING.apm[apmTier]);
    const tierLabel = {base:'APM', pro:'APM Pro (+Data Streams)', enterprise:'APM Enterprise (+Profiler)'}[apmTier];
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Tier</td><td>${tierLabel} (${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${unitP}/host/mo</td></tr>`;
    bd += `<tr><td>Traced hosts</td><td>${dims.hosts} (= K8s nodes)</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.hosts} hosts × $${unitP}</td><td><strong>${fmt(dims.hosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Includes per host: 150 GB span ingestion + 1M indexed spans. Overages: $0.10/GB ingested, $${price(PRICING.logs.indexing[ret]).toFixed(2)}/1M indexed (${ret}-day). Priced per K8s node, not per pod.</div>`;
    html += dimCard('APM', fmt(costs.apm) + '/mo', bd);
  }

  // Logs
  if (chk('dd-logs')) {
    const idxP = price(PRICING.logs.indexing[ret]);
    const ingCost = dims.logGBPerMonth * PRICING.logs.ingestionPerGB;
    const idxCost = (dims.logEventsPerMonth / 1e6) * idxP;
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">Ingestion (all retention tiers)</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$0.10/GB</td></tr>`;
    bd += `<tr><td>Volume</td><td>${dims.logGBPerMonth.toFixed(0)} GB/mo (${dims.logGBPerDay.toFixed(1)} GB/day)</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.logGBPerMonth.toFixed(0)} GB × $0.10</td><td><strong>${fmt(ingCost)}/mo</strong></td></tr>`;
    bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">Indexing (${ret}-day retention, ${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${idxP.toFixed(2)}/1M events</td></tr>`;
    bd += `<tr><td>Volume</td><td>${fmtK(Math.round(dims.logEventsPerMonth))} events/mo</td></tr>`;
    bd += `<tr class="ps-calc"><td>${(dims.logEventsPerMonth / 1e6).toFixed(1)}M × $${idxP.toFixed(2)}</td><td><strong>${fmt(idxCost)}/mo</strong></td></tr>`;
    bd += `<tr class="ps-total"><td>Total Log Cost</td><td><strong>${fmt(ingCost + idxCost)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    // Top contributors
    const httpDets = dims.serviceDetails.filter(s => s.type === 'http').sort((a,b) => b.logGB - a.logGB);
    bd += '<div class="ps-contrib">Top contributors: ' + httpDets.slice(0,4).map(s => `${s.name} (${s.logGB.toFixed(1)} GB/d)`).join(', ') + '</div>';
    bd += `<div class="ps-note">Dual billing: you pay BOTH ingestion (per GB) and indexing (per million events). Retention options: 3d ($1.06), 7d ($1.27), 15d ($1.70), 30d ($2.50) per 1M events (annual).</div>`;
    html += dimCard('Log Management', fmt(costs.logs) + '/mo', bd);
  }

  // Custom Metrics
  if (chk('dd-metrics')) {
    const allotPerHost = PRICING.infrastructure.includedMetrics[tier];
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Total custom metrics</td><td>${fmtK(dims.customMetrics)}</td></tr>`;
    bd += `<tr><td>Included allotment</td><td>${fmtK(dims.metricAllotment)} (${allotPerHost}/host × ${dims.hosts} hosts)</td></tr>`;
    bd += `<tr><td>Overage</td><td>${fmtK(dims.metricOverage)}</td></tr>`;
    bd += `<tr><td>Unit price (overage)</td><td>$5.00 per 100 metrics/mo</td></tr>`;
    bd += `<tr class="ps-calc"><td>${Math.ceil(dims.metricOverage/100)} × 100 metrics × $5.00</td><td><strong>${fmt(Math.ceil(dims.metricOverage/100)*5)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    const metDets = dims.serviceDetails.filter(s => s.metrics > 0).sort((a,b) => b.metrics - a.metrics);
    bd += '<div class="ps-contrib">Top contributors: ' + metDets.slice(0,4).map(s => `${s.name} (${fmtK(s.metrics)})`).join(', ') + '</div>';
    bd += `<div class="ps-note">Custom metric = unique (name + tag values). High-cardinality tags are multiplicative. All OTel/Prometheus metrics count as custom. DISTRIBUTION type generates 5 series per tag combo (10 with percentiles).</div>`;
    html += dimCard('Custom Metrics', fmt(costs.metrics) + '/mo', bd);
  }

  // Synthetics
  if (chk('dd-synthetics')) {
    const apiEndpoints = dims.httpServices * 2;
    const apiRuns = apiEndpoints * (1440/5) * 3 * 30;
    const browserRuns = 2 * (1440/15) * 2 * 30;
    const apiP = price(PRICING.synthetics.apiPer10K);
    const brwP = price(PRICING.synthetics.browserPer1K);
    const apiCost = (apiRuns/10000) * apiP;
    const brwCost = (browserRuns/1000) * brwP;
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">API Tests (${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${apiP.toFixed(2)} per 10K test runs</td></tr>`;
    bd += `<tr><td>Config</td><td>${apiEndpoints} endpoints × every 5 min × 3 locations × 30 days</td></tr>`;
    bd += `<tr><td>Monthly runs</td><td>${fmtK(apiRuns)}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${(apiRuns/10000).toFixed(1)} × $${apiP.toFixed(2)}</td><td><strong>${fmt(apiCost)}/mo</strong></td></tr>`;
    bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">Browser Tests (${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${brwP.toFixed(2)} per 1K test runs</td></tr>`;
    bd += `<tr><td>Config</td><td>2 flows × every 15 min × 2 locations × 30 days</td></tr>`;
    bd += `<tr><td>Monthly runs</td><td>${fmtK(browserRuns)}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${(browserRuns/1000).toFixed(1)} × $${brwP.toFixed(2)}</td><td><strong>${fmt(brwCost)}/mo</strong></td></tr>`;
    bd += `<tr class="ps-total"><td>Total Synthetics</td><td><strong>${fmt(apiCost+brwCost)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Browser tests are 24x more expensive per run than API tests. Cost multiplied by frequency × locations. Mobile: $50/100 runs.</div>`;
    html += dimCard('Synthetic Monitoring', fmt(costs.synthetics) + '/mo', bd);
  }

  // RUM
  if (chk('dd-rum')) {
    const dau = val('dd-rum-dau');
    const spd = val('dd-rum-spd') || 1.2;
    const replayPct = val('dd-rum-replay') || 0;
    const sessions = dau * spd * 30;
    const sessP = price(PRICING.rum.sessionsPer1K);
    const repP = price(PRICING.rum.replayPer1K);
    const sessCost = (sessions/1000) * sessP;
    const repSessions = sessions * replayPct / 100;
    const repCost = (repSessions/1000) * repP;
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">Product Analytics (${bl})</td></tr>`;
    bd += `<tr><td>Unit price</td><td>$${sessP.toFixed(2)} per 1K sessions</td></tr>`;
    bd += `<tr><td>DAU</td><td>${fmtK(dau)} × ${spd} sessions/user × 30 days</td></tr>`;
    bd += `<tr><td>Monthly sessions</td><td>${fmtK(Math.round(sessions))}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${(sessions/1000).toFixed(1)}K × $${sessP.toFixed(2)}</td><td><strong>${fmt(sessCost)}/mo</strong></td></tr>`;
    if (replayPct > 0) {
      bd += `<tr><td colspan="2" style="font-weight:600;padding-top:4px">Session Replay (${replayPct}% sampled)</td></tr>`;
      bd += `<tr><td>Unit price</td><td>$${repP.toFixed(2)} per 1K replays</td></tr>`;
      bd += `<tr><td>Replays</td><td>${fmtK(Math.round(repSessions))}/mo</td></tr>`;
      bd += `<tr class="ps-calc"><td>${(repSessions/1000).toFixed(1)}K × $${repP.toFixed(2)}</td><td><strong>${fmt(repCost)}/mo</strong></td></tr>`;
    }
    bd += `<tr class="ps-total"><td>Total RUM</td><td><strong>${fmt(sessCost+repCost)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Session = user visit, expires after 15 min idle (4h hard cap). SPA routing does NOT create new sessions. Also available: RUM Measure ($0.15/1K) and RUM Investigate ($3.00/1K filtered).</div>`;
    html += dimCard('Real User Monitoring', fmt(costs.rum) + '/mo', bd);
  }

  // Database Monitoring
  if (chk('dd-dbm')) {
    const unitP = price(PRICING.dbm.perHost);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Unit price (${bl})</td><td>$${unitP}/host/mo</td></tr>`;
    bd += `<tr><td>DB hosts</td><td>${dims.dbHosts}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.dbHosts} hosts × $${unitP}</td><td><strong>${fmt(dims.dbHosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += dims.teamBreakdown.map((t, i) => {
      const dbs = (model.teams[i]?.services || []).filter(s => s.type === 'database' || s.type === 'cache');
      return dbs.length > 0 ? `<span style="color:${t.color}">${t.name}</span>: ${dbs.map(d => d.name + ' (' + (d.instances||1) + ')').join(', ')}` : '';
    }).filter(Boolean).join(' · ');
    html += dimCard('Database Monitoring', fmt(costs.dbm) + '/mo', bd);
  }

  // Network Monitoring
  if (chk('dd-network')) {
    const unitP = price(PRICING.network.cloudPerHost);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Cloud Network Mon (${bl})</td><td>$${unitP.toFixed(2)}/host/mo</td></tr>`;
    bd += `<tr><td>Hosts</td><td>${dims.hosts}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.hosts} hosts × $${unitP.toFixed(2)}</td><td><strong>${fmt(dims.hosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Also available: Network Device Mon ($7/device), Wireless AP ($4/device), NetFlow ($0.60-$0.85/1M flows by retention).</div>`;
    html += dimCard('Network Monitoring', fmt(costs.network) + '/mo', bd);
  }

  // Security
  if (chk('dd-security')) {
    const secTier = $('dd-security-tier').value;
    const unitP = price(PRICING.security[secTier]);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>CSM ${secTier === 'enterprise' ? 'Enterprise' : 'Pro'} (${bl})</td><td>$${unitP}/host/mo</td></tr>`;
    bd += `<tr><td>Hosts</td><td>${dims.hosts}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.hosts} hosts × $${unitP}</td><td><strong>${fmt(dims.hosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Also: Workload Protection ($15/host), App & API Protection ($31/host), Cloud SIEM ($5/1M events). DevSecOps bundles: Pro $22/host, Ent $34/host (includes Infra + CSM).</div>`;
    html += dimCard('Cloud Security (CSM)', fmt(costs.security) + '/mo', bd);
  }

  // Error Tracking
  if (chk('dd-errors')) {
    const errMo = dims._errorsPerMonth || 0;
    const baseP = price(PRICING.errorTracking.base);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Base (first 50K errors)</td><td>$${baseP}/mo flat</td></tr>`;
    bd += `<tr><td>Estimated errors</td><td>${fmtK(Math.round(errMo))}/mo (~2% of requests)</td></tr>`;
    if (errMo > 50000) {
      const over = errMo - 50000;
      const tier = PRICING.errorTracking.tiers.find(tr => errMo <= tr.max) || PRICING.errorTracking.tiers[PRICING.errorTracking.tiers.length-1];
      const tierP = price(tier);
      bd += `<tr><td>Overage rate</td><td>$${tierP.toFixed(2)}/1K errors</td></tr>`;
      bd += `<tr class="ps-calc"><td>$${baseP} + ${(over/1000).toFixed(1)}K × $${tierP.toFixed(2)}</td><td><strong>${fmt(costs.errorTracking)}/mo</strong></td></tr>`;
    } else {
      bd += `<tr class="ps-calc"><td>Flat fee (under 50K)</td><td><strong>${fmt(baseP)}/mo</strong></td></tr>`;
    }
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Volume-tiered: 50-100K ($0.25/1K), 100-500K ($0.21/1K), 500K-10M ($0.17/1K), 10-20M ($0.12/1K), 20M+ ($0.10/1K). Annual pricing shown.</div>`;
    html += dimCard('Error Tracking', fmt(costs.errorTracking) + '/mo', bd);
  }

  // Cloud SIEM
  if (chk('dd-csiem')) {
    const siemEv = dims._siemEvents || 0;
    const unitP = price(PRICING.csiem.perMEvents);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Unit price (${bl})</td><td>$${unitP.toFixed(2)} per 1M events</td></tr>`;
    bd += `<tr><td>Security events</td><td>${fmtK(Math.round(siemEv))}/mo (~10% of log events)</td></tr>`;
    bd += `<tr class="ps-calc"><td>${(siemEv/1e6).toFixed(1)}M × $${unitP.toFixed(2)}</td><td><strong>${fmt((siemEv/1e6)*unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    html += dimCard('Cloud SIEM', fmt(costs.csiem) + '/mo', bd);
  }

  // CI Visibility
  if (chk('dd-civis')) {
    const committers = val('dd-civis-committers') || 0;
    const unitP = price(PRICING.ciVisibility.perCommitter);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>Pipeline Visibility (${bl})</td><td>$${unitP}/committer/mo</td></tr>`;
    bd += `<tr><td>Committers</td><td>${committers}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${committers} × $${unitP}</td><td><strong>${fmt(committers * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Also available: Test Optimization ($20/committer), Code Coverage ($8/committer).</div>`;
    html += dimCard('CI Visibility', fmt(costs.civis) + '/mo', bd);
  }

  // Incident Management
  if (chk('dd-incidents')) {
    const seats = val('dd-incidents-seats') || 0;
    const unitP = price(PRICING.incidents.perSeat);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>On-Call (${bl})</td><td>$${unitP}/seat/mo</td></tr>`;
    bd += `<tr><td>Seats</td><td>${seats}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${seats} × $${unitP}</td><td><strong>${fmt(seats * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Also: Incident Management ($30/seat), Incident Response ($40/seat), Workflow Automation ($10/100 executions).</div>`;
    html += dimCard('Incident Management', fmt(costs.incidents) + '/mo', bd);
  }

  // Universal Service Monitoring
  if (chk('dd-usm')) {
    const unitP = price(PRICING.usm.perHost);
    let bd = `<table class="ps"><thead><tr><th>Rate Card</th><th></th></tr></thead><tbody>`;
    bd += `<tr><td>USM (${bl})</td><td>$${unitP}/host/mo</td></tr>`;
    bd += `<tr><td>Hosts</td><td>${dims.hosts}</td></tr>`;
    bd += `<tr class="ps-calc"><td>${dims.hosts} × $${unitP}</td><td><strong>${fmt(dims.hosts * unitP)}/mo</strong></td></tr>`;
    bd += `</tbody></table>`;
    bd += `<div class="ps-note">Auto-discovers services via eBPF without code changes. Complements APM for uninstrumented services.</div>`;
    html += dimCard('Universal Service Monitoring', fmt(costs.usm) + '/mo', bd);
  }

  if (discount > 0) {
    html += `<div class="dim-card" style="background:var(--accent-light);border-color:var(--accent)">
      <h4>Negotiated Discount Applied</h4>
      <div class="dim-breakdown">All prices above are pre-discount. A <strong>${(discount*100).toFixed(0)}%</strong> discount is applied to the total.<br>
      Enterprise contracts typically negotiate 15-40% off list pricing.</div>
    </div>`;
  }

  $('dimGrid').innerHTML = html;
}

function dimCard(title, costStr, breakdown) {
  return `<div class="dim-card">
    <div class="dim-header"><h4>${title}</h4><span class="dim-cost">${costStr}</span></div>
    <div class="dim-breakdown">${breakdown}</div>
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
function toggleCivisDetail() {
  $('civis-detail').style.display = chk('dd-civis') ? 'flex' : 'none';
}
function toggleIncidentsDetail() {
  $('incidents-detail').style.display = chk('dd-incidents') ? 'flex' : 'none';
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
    // Reset all new product checkboxes
    ['dd-errors','dd-csiem','dd-civis','dd-incidents','dd-usm'].forEach(id => { if ($(id)) $(id).checked = false; });

    if (name === 'startup') {
      $('dd-infra-tier').value = 'pro';
      $('dd-apm-tier').value = 'base';
      $('dd-logs-ret').value = '7';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-metrics').checked = true;
      $('dd-synthetics').checked = false; $('dd-rum').checked = false;
      $('dd-dbm').checked = true; $('dd-network').checked = false; $('dd-security').checked = false;
      $('dd-rum-dau').value = 0; $('discount').value = 0;
      $('dd-civis-committers').value = 0; $('dd-incidents-seats').value = 0;
    } else if (name === 'midmarket') {
      $('dd-infra-tier').value = 'enterprise';
      $('dd-apm-tier').value = 'enterprise';
      $('dd-logs-ret').value = '15';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-metrics').checked = true;
      $('dd-synthetics').checked = true; $('dd-rum').checked = true;
      $('dd-dbm').checked = true; $('dd-network').checked = true; $('dd-security').checked = false;
      $('dd-errors').checked = true;
      $('dd-rum-dau').value = 10000; $('dd-rum-spd').value = 1.2; $('dd-rum-replay').value = 10;
      $('dd-civis-committers').value = 0; $('dd-incidents-seats').value = 0;
      $('discount').value = 15;
    } else if (name === 'enterprise') {
      $('dd-infra-tier').value = 'enterprise';
      $('dd-apm-tier').value = 'enterprise';
      $('dd-logs-ret').value = '30';
      $('dd-infra').checked = true; $('dd-apm').checked = true; $('dd-logs').checked = true;
      $('dd-metrics').checked = true;
      $('dd-synthetics').checked = true; $('dd-rum').checked = true;
      $('dd-dbm').checked = true; $('dd-network').checked = true; $('dd-security').checked = true;
      $('dd-security-tier').value = 'enterprise';
      $('dd-errors').checked = true; $('dd-csiem').checked = true;
      $('dd-civis').checked = true; $('dd-civis-committers').value = 30;
      $('dd-incidents').checked = true; $('dd-incidents-seats').value = 10;
      $('dd-usm').checked = true;
      $('dd-rum-dau').value = 50000; $('dd-rum-spd').value = 1.3; $('dd-rum-replay').value = 10;
      $('discount').value = 25;
    }
    toggleRumDetail();
    toggleCivisDetail();
    toggleIncidentsDetail();
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
