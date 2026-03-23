// Datadog Pricing Data (list prices, annual commitment)
const PRICING = {
  infrastructure: {
    pro:        { annual: 15, onDemand: 18 },
    enterprise: { annual: 23, onDemand: 27 },
    includedContainers: { pro: 5, enterprise: 10 },
    includedCustomMetrics: { pro: 100, enterprise: 200 }
  },
  apm: {
    base:       { annual: 31, onDemand: 36 },
    pro:        { annual: 35, onDemand: 42 },
    enterprise: { annual: 40, onDemand: 48 },
    includedSpanIngestionGB: 150,
    includedIndexedSpans: 1000000,
    indexedSpans: {
      7:  { annual: 1.27, onDemand: 1.91 },
      15: { annual: 1.70, onDemand: 2.55 },
      30: { annual: 2.50, onDemand: 3.75 }
    }
  },
  logs: {
    ingestionPerGB: 0.10,
    indexing: {
      3:  { annual: 1.06, onDemand: 1.59 },
      7:  { annual: 1.27, onDemand: 1.91 },
      15: { annual: 1.70, onDemand: 2.55 },
      30: { annual: 2.50, onDemand: 3.75 }
    }
  },
  containers: {
    prepaid: 1.00,
    onDemandPerHour: 0.002,
    onDemandMonthly: 1.49
  },
  customMetrics: {
    per100: 5.00
  },
  serverless: {
    functions:   { annual: 5, onDemand: 7.20 },
    apmPer1M:    { annual: 10, onDemand: 15 }
  },
  synthetics: {
    apiPer10K:     { annual: 5, onDemand: 7.20 },
    browserPer1K:  { annual: 12, onDemand: 18 }
  },
  rum: {
    sessionsPer1K: { annual: 0.80, onDemand: 1.20 },
    replayPer1K:   { annual: 2.50, onDemand: 3.60 }
  },
  dbm: {
    perHost: { annual: 70, onDemand: 84 }
  },
  network: {
    cloudPerHost:   { annual: 5, onDemand: 7.20 },
    devicePerHost:  { annual: 7, onDemand: 10.20 }
  },
  security: {
    pro:        { annual: 10, onDemand: 12 },
    enterprise: { annual: 25, onDemand: 30 }
  }
};

// Scenario presets
const PRESETS = {
  startup: {
    label: 'Startup (10 hosts, basic stack)',
    values: {
      'infrastructure-enabled': true, 'infra-hosts': 10, 'infra-tier': 'pro',
      'apm-enabled': true, 'apm-hosts': 10, 'apm-tier': 'base', 'apm-indexed-spans': 0, 'apm-retention': '15',
      'logs-enabled': true, 'logs-ingestion-gb': 50, 'logs-indexed-events': 10, 'logs-retention': '7',
      'containers-enabled': true, 'container-count': 30, 'container-billing': 'ondemand',
      'customMetrics-enabled': false, 'custom-metrics-count': 0,
      'serverless-enabled': false, 'serverless-functions': 0, 'serverless-invocations': 0,
      'synthetics-enabled': false, 'synthetics-api': 0, 'synthetics-browser': 0,
      'rum-enabled': false, 'rum-sessions': 0, 'rum-replay': 'no',
      'dbm-enabled': false, 'dbm-hosts': 0,
      'network-enabled': false, 'network-hosts': 0, 'network-devices': 0,
      'security-enabled': false, 'security-hosts': 0, 'security-tier': 'pro'
    }
  },
  midmarket: {
    label: 'Mid-Market (100 hosts, full stack)',
    values: {
      'infrastructure-enabled': true, 'infra-hosts': 100, 'infra-tier': 'pro',
      'apm-enabled': true, 'apm-hosts': 100, 'apm-tier': 'pro', 'apm-indexed-spans': 5, 'apm-retention': '15',
      'logs-enabled': true, 'logs-ingestion-gb': 500, 'logs-indexed-events': 100, 'logs-retention': '15',
      'containers-enabled': true, 'container-count': 400, 'container-billing': 'prepaid',
      'customMetrics-enabled': true, 'custom-metrics-count': 5000,
      'serverless-enabled': true, 'serverless-functions': 50, 'serverless-invocations': 10,
      'synthetics-enabled': true, 'synthetics-api': 5, 'synthetics-browser': 2,
      'rum-enabled': true, 'rum-sessions': 100, 'rum-replay': 'no',
      'dbm-enabled': true, 'dbm-hosts': 5,
      'network-enabled': true, 'network-hosts': 100, 'network-devices': 0,
      'security-enabled': false, 'security-hosts': 0, 'security-tier': 'pro'
    }
  },
  enterprise: {
    label: 'Enterprise (500 hosts, full stack + security)',
    values: {
      'infrastructure-enabled': true, 'infra-hosts': 500, 'infra-tier': 'enterprise',
      'apm-enabled': true, 'apm-hosts': 500, 'apm-tier': 'enterprise', 'apm-indexed-spans': 50, 'apm-retention': '30',
      'logs-enabled': true, 'logs-ingestion-gb': 5000, 'logs-indexed-events': 1000, 'logs-retention': '30',
      'containers-enabled': true, 'container-count': 3000, 'container-billing': 'prepaid',
      'customMetrics-enabled': true, 'custom-metrics-count': 50000,
      'serverless-enabled': true, 'serverless-functions': 200, 'serverless-invocations': 100,
      'synthetics-enabled': true, 'synthetics-api': 20, 'synthetics-browser': 10,
      'rum-enabled': true, 'rum-sessions': 1000, 'rum-replay': 'yes',
      'dbm-enabled': true, 'dbm-hosts': 20,
      'network-enabled': true, 'network-hosts': 500, 'network-devices': 50,
      'security-enabled': true, 'security-hosts': 500, 'security-tier': 'enterprise'
    }
  }
};

// State
let billingType = 'annual';
let breakdownChart = null;
let growthChart = null;

// Helpers
function $(id) { return document.getElementById(id); }
function val(id) { return parseFloat($(id).value) || 0; }
function checked(id) { return $(id).checked; }
function fmt(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtDec(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getPrice(priceObj) {
  return priceObj[billingType] || priceObj.annual;
}

function toggleProduct(product) {
  const body = $(product + '-body');
  body.classList.toggle('collapsed');
}

// Calculation
function calculate() {
  const discount = val('discount') / 100;
  $('discountValue').textContent = val('discount') + '%';

  const costs = {};

  // Infrastructure
  if (checked('infrastructure-enabled')) {
    const hosts = val('infra-hosts');
    const tier = $('infra-tier').value;
    const price = getPrice(PRICING.infrastructure[tier]);
    costs.infrastructure = hosts * price;
    $('infra-detail').textContent = `${hosts} hosts x ${fmtDec(price)}/host = ${fmt(costs.infrastructure)}/mo`;
  } else {
    costs.infrastructure = 0;
    $('infra-detail').textContent = '';
  }

  // APM
  if (checked('apm-enabled')) {
    const hosts = val('apm-hosts');
    const tier = $('apm-tier').value;
    const price = getPrice(PRICING.apm[tier]);
    let apmCost = hosts * price;

    const extraSpans = val('apm-indexed-spans');
    const retention = $('apm-retention').value;
    if (extraSpans > 0 && PRICING.apm.indexedSpans[retention]) {
      const spanPrice = getPrice(PRICING.apm.indexedSpans[retention]);
      apmCost += extraSpans * spanPrice;
    }
    costs.apm = apmCost;
    $('apm-detail').textContent = `${hosts} hosts x ${fmtDec(price)}/host = ${fmt(hosts * price)}/mo` +
      (extraSpans > 0 ? ` + ${extraSpans}M indexed spans = ${fmt(apmCost)}/mo` : '');
  } else {
    costs.apm = 0;
    $('apm-detail').textContent = '';
  }

  // Logs
  if (checked('logs-enabled')) {
    const gb = val('logs-ingestion-gb');
    const events = val('logs-indexed-events');
    const retention = $('logs-retention').value;
    const ingestionCost = gb * PRICING.logs.ingestionPerGB;
    const indexPrice = getPrice(PRICING.logs.indexing[retention]);
    const indexingCost = events * indexPrice;
    costs.logs = ingestionCost + indexingCost;
    $('logs-detail').textContent = `Ingestion: ${gb} GB x $0.10 = ${fmt(ingestionCost)} + Indexing: ${events}M events x ${fmtDec(indexPrice)} = ${fmt(indexingCost)} = ${fmt(costs.logs)}/mo`;
  } else {
    costs.logs = 0;
    $('logs-detail').textContent = '';
  }

  // Containers
  if (checked('containers-enabled')) {
    const count = val('container-count');
    const billing = $('container-billing').value;

    // Subtract included containers from infra hosts
    let included = 0;
    if (checked('infrastructure-enabled')) {
      const tier = $('infra-tier').value;
      included = val('infra-hosts') * PRICING.infrastructure.includedContainers[tier];
    }
    const billable = Math.max(0, count - included);

    if (billing === 'prepaid') {
      costs.containers = billable * PRICING.containers.prepaid;
    } else {
      costs.containers = billable * PRICING.containers.onDemandMonthly;
    }
    const price = billing === 'prepaid' ? PRICING.containers.prepaid : PRICING.containers.onDemandMonthly;
    $('containers-detail').textContent = `${count} total - ${included} included = ${billable} billable x ${fmtDec(price)} = ${fmt(costs.containers)}/mo`;
  } else {
    costs.containers = 0;
    $('containers-detail').textContent = '';
  }

  // Custom Metrics
  if (checked('customMetrics-enabled')) {
    const total = val('custom-metrics-count');
    let included = 0;
    if (checked('infrastructure-enabled')) {
      const tier = $('infra-tier').value;
      included = val('infra-hosts') * PRICING.infrastructure.includedCustomMetrics[tier];
    }
    const overage = Math.max(0, total - included);
    costs.customMetrics = Math.ceil(overage / 100) * PRICING.customMetrics.per100;
    $('customMetrics-detail').textContent = `${total.toLocaleString()} total - ${included.toLocaleString()} included = ${overage.toLocaleString()} overage = ${fmt(costs.customMetrics)}/mo`;
  } else {
    costs.customMetrics = 0;
    $('customMetrics-detail').textContent = '';
  }

  // Serverless
  if (checked('serverless-enabled')) {
    const functions = val('serverless-functions');
    const invocations = val('serverless-invocations');
    const funcPrice = getPrice(PRICING.serverless.functions);
    const funcCost = functions * funcPrice;
    const apmPrice = getPrice(PRICING.serverless.apmPer1M);
    const apmCost = invocations * apmPrice;
    costs.serverless = funcCost + apmCost;
    $('serverless-detail').textContent = `${functions} functions x ${fmtDec(funcPrice)} = ${fmt(funcCost)} + ${invocations}M invocations x ${fmtDec(apmPrice)} = ${fmt(apmCost)} = ${fmt(costs.serverless)}/mo`;
  } else {
    costs.serverless = 0;
    $('serverless-detail').textContent = '';
  }

  // Synthetics
  if (checked('synthetics-enabled')) {
    const api = val('synthetics-api');
    const browser = val('synthetics-browser');
    const apiPrice = getPrice(PRICING.synthetics.apiPer10K);
    const browserPrice = getPrice(PRICING.synthetics.browserPer1K);
    costs.synthetics = (api * apiPrice) + (browser * browserPrice);
    $('synthetics-detail').textContent = `API: ${api} x 10K runs x ${fmtDec(apiPrice)} + Browser: ${browser} x 1K runs x ${fmtDec(browserPrice)} = ${fmt(costs.synthetics)}/mo`;
  } else {
    costs.synthetics = 0;
    $('synthetics-detail').textContent = '';
  }

  // RUM
  if (checked('rum-enabled')) {
    const sessions = val('rum-sessions');
    const replay = $('rum-replay').value === 'yes';
    const sessionPrice = getPrice(PRICING.rum.sessionsPer1K);
    let rumCost = sessions * sessionPrice;
    if (replay) {
      const replayPrice = getPrice(PRICING.rum.replayPer1K);
      rumCost += sessions * replayPrice;
    }
    costs.rum = rumCost;
    $('rum-detail').textContent = `${sessions} x 1K sessions x ${fmtDec(sessionPrice)}${replay ? ' + replay' : ''} = ${fmt(costs.rum)}/mo`;
  } else {
    costs.rum = 0;
    $('rum-detail').textContent = '';
  }

  // Database Monitoring
  if (checked('dbm-enabled')) {
    const hosts = val('dbm-hosts');
    const price = getPrice(PRICING.dbm.perHost);
    costs.dbm = hosts * price;
  } else {
    costs.dbm = 0;
  }

  // Network Monitoring
  if (checked('network-enabled')) {
    const hosts = val('network-hosts');
    const devices = val('network-devices');
    const hostPrice = getPrice(PRICING.network.cloudPerHost);
    const devicePrice = getPrice(PRICING.network.devicePerHost);
    costs.network = (hosts * hostPrice) + (devices * devicePrice);
  } else {
    costs.network = 0;
  }

  // Cloud Security
  if (checked('security-enabled')) {
    const hosts = val('security-hosts');
    const tier = $('security-tier').value;
    const price = getPrice(PRICING.security[tier]);
    costs.security = hosts * price;
  } else {
    costs.security = 0;
  }

  // Apply discount
  let totalMonthly = 0;
  const discountedCosts = {};
  for (const [key, cost] of Object.entries(costs)) {
    discountedCosts[key] = cost * (1 - discount);
    totalMonthly += discountedCosts[key];
  }

  // Update product cost badges
  const productNames = {
    infrastructure: 'Infrastructure',
    apm: 'APM',
    logs: 'Log Management',
    containers: 'Containers',
    customMetrics: 'Custom Metrics',
    serverless: 'Serverless',
    synthetics: 'Synthetics',
    rum: 'RUM',
    dbm: 'Database Monitoring',
    network: 'Network Monitoring',
    security: 'Cloud Security'
  };

  for (const [key, cost] of Object.entries(discountedCosts)) {
    const el = $(key + '-cost');
    if (el) el.textContent = fmt(Math.round(cost)) + '/mo';
  }

  // Totals
  $('totalMonthly').textContent = fmt(Math.round(totalMonthly));
  $('totalAnnual').textContent = fmt(Math.round(totalMonthly * 12));

  // Savings comparison (annual vs on-demand)
  if (billingType === 'annual' && totalMonthly > 0) {
    const savedBilling = billingType;
    billingType = 'onDemand';
    let onDemandTotal = 0;
    // Recalculate at on-demand prices
    for (const [key, cost] of Object.entries(costs)) {
      // We need to recalculate each product at on-demand prices
      // For simplicity, use the ratio approach
    }
    billingType = savedBilling;

    // Calculate on-demand equivalent
    const onDemandMonthly = calculateOnDemandTotal();
    const annualSavings = (onDemandMonthly - totalMonthly) * 12;
    if (annualSavings > 0) {
      $('savingsCard').style.display = 'block';
      $('savingsAmount').textContent = fmt(Math.round(annualSavings)) + '/yr';
      const pct = ((onDemandMonthly - totalMonthly) / onDemandMonthly * 100).toFixed(1);
      $('savingsPct').textContent = pct + '% less than on-demand pricing';
    } else {
      $('savingsCard').style.display = 'none';
    }
  } else {
    $('savingsCard').style.display = 'none';
  }

  // Breakdown chart
  updateBreakdownChart(discountedCosts, productNames);

  // Line items table
  updateLineItems(discountedCosts, productNames, totalMonthly);

  // Growth chart
  updateGrowthChart();

  // Unit economics
  updateUnitEconomics();

  // Store for growth projection
  window._currentMonthly = totalMonthly;
  window._currentCosts = discountedCosts;
}

function calculateOnDemandTotal() {
  const discount = val('discount') / 100;
  let total = 0;

  if (checked('infrastructure-enabled')) {
    const hosts = val('infra-hosts');
    const tier = $('infra-tier').value;
    total += hosts * PRICING.infrastructure[tier].onDemand;
  }
  if (checked('apm-enabled')) {
    const hosts = val('apm-hosts');
    const tier = $('apm-tier').value;
    total += hosts * PRICING.apm[tier].onDemand;
    const extraSpans = val('apm-indexed-spans');
    const retention = $('apm-retention').value;
    if (extraSpans > 0 && PRICING.apm.indexedSpans[retention]) {
      total += extraSpans * PRICING.apm.indexedSpans[retention].onDemand;
    }
  }
  if (checked('logs-enabled')) {
    const gb = val('logs-ingestion-gb');
    const events = val('logs-indexed-events');
    const retention = $('logs-retention').value;
    total += gb * PRICING.logs.ingestionPerGB;
    total += events * PRICING.logs.indexing[retention].onDemand;
  }
  if (checked('containers-enabled')) {
    const count = val('container-count');
    let included = 0;
    if (checked('infrastructure-enabled')) {
      const tier = $('infra-tier').value;
      included = val('infra-hosts') * PRICING.infrastructure.includedContainers[tier];
    }
    const billable = Math.max(0, count - included);
    total += billable * PRICING.containers.onDemandMonthly;
  }
  if (checked('customMetrics-enabled')) {
    const totalMetrics = val('custom-metrics-count');
    let included = 0;
    if (checked('infrastructure-enabled')) {
      const tier = $('infra-tier').value;
      included = val('infra-hosts') * PRICING.infrastructure.includedCustomMetrics[tier];
    }
    const overage = Math.max(0, totalMetrics - included);
    total += Math.ceil(overage / 100) * PRICING.customMetrics.per100;
  }
  if (checked('serverless-enabled')) {
    total += val('serverless-functions') * PRICING.serverless.functions.onDemand;
    total += val('serverless-invocations') * PRICING.serverless.apmPer1M.onDemand;
  }
  if (checked('synthetics-enabled')) {
    total += val('synthetics-api') * PRICING.synthetics.apiPer10K.onDemand;
    total += val('synthetics-browser') * PRICING.synthetics.browserPer1K.onDemand;
  }
  if (checked('rum-enabled')) {
    const sessions = val('rum-sessions');
    total += sessions * PRICING.rum.sessionsPer1K.onDemand;
    if ($('rum-replay').value === 'yes') {
      total += sessions * PRICING.rum.replayPer1K.onDemand;
    }
  }
  if (checked('dbm-enabled')) {
    total += val('dbm-hosts') * PRICING.dbm.perHost.onDemand;
  }
  if (checked('network-enabled')) {
    total += val('network-hosts') * PRICING.network.cloudPerHost.onDemand;
    total += val('network-devices') * PRICING.network.devicePerHost.onDemand;
  }
  if (checked('security-enabled')) {
    const tier = $('security-tier').value;
    total += val('security-hosts') * PRICING.security[tier].onDemand;
  }

  return total * (1 - discount);
}

// Charts
const CHART_COLORS = [
  '#632CA6', '#8B5CF6', '#A78BFA', '#C4B5FD',
  '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD',
  '#059669', '#10B981', '#34D399'
];

function updateBreakdownChart(costs, names) {
  const data = [];
  const labels = [];
  const colors = [];
  let i = 0;

  for (const [key, cost] of Object.entries(costs)) {
    if (cost > 0) {
      data.push(Math.round(cost));
      labels.push(names[key] || key);
      colors.push(CHART_COLORS[i % CHART_COLORS.length]);
    }
    i++;
  }

  if (breakdownChart) {
    breakdownChart.data.labels = labels;
    breakdownChart.data.datasets[0].data = data;
    breakdownChart.data.datasets[0].backgroundColor = colors;
    breakdownChart.update();
  } else {
    const ctx = $('breakdownChart').getContext('2d');
    breakdownChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, padding: 8 }
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return ctx.label + ': ' + fmt(ctx.raw) + '/mo (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }
}

function updateLineItems(costs, names, total) {
  const tbody = $('lineItems');
  let html = '';

  for (const [key, cost] of Object.entries(costs)) {
    if (cost > 0) {
      html += `<tr><td>${names[key]}</td><td>${fmt(Math.round(cost))}</td><td>${fmt(Math.round(cost * 12))}</td></tr>`;
    }
  }

  html += `<tr><td>Total</td><td>${fmt(Math.round(total))}</td><td>${fmt(Math.round(total * 12))}</td></tr>`;
  tbody.innerHTML = html;
}

function updateGrowthChart() {
  const monthly = window._currentMonthly || 0;
  const rate = val('growth-rate') / 100;

  const labels = [];
  const data = [];
  let cumulative = 0;

  for (let i = 0; i < 12; i++) {
    const month = monthly * Math.pow(1 + rate, i);
    labels.push('M' + (i + 1));
    data.push(Math.round(month));
    cumulative += month;
  }

  if (growthChart) {
    growthChart.data.labels = labels;
    growthChart.data.datasets[0].data = data;
    growthChart.update();
  } else {
    const ctx = $('growthChart').getContext('2d');
    growthChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Monthly Cost',
          data: data,
          backgroundColor: '#632CA6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return fmt(ctx.raw) + '/mo'; }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(v) { return fmt(v); }
            }
          }
        }
      }
    });
  }

  // Growth summary
  const m12 = data[11] || 0;
  const totalYear = Math.round(cumulative);
  $('growthSummary').innerHTML =
    `Month 1: <strong>${fmt(data[0] || 0)}</strong> &rarr; Month 12: <strong>${fmt(m12)}</strong><br>` +
    `Total 12-month spend: <strong>${fmt(totalYear)}</strong>` +
    (rate > 0 ? `<br>Growth multiplier: <strong>${(Math.pow(1 + rate, 11)).toFixed(1)}x</strong>` : '');
}

function updateHWM() {
  const normal = val('hwm-normal');
  const peak = val('hwm-peak');
  const peakHours = val('hwm-hours');
  const totalHours = 730; // avg hours in a month
  const top1pct = Math.ceil(totalHours * 0.01); // ~7 hours

  // If peak hours <= top 1%, peak is fully forgiven
  const peakForgiven = peakHours <= top1pct;

  const infraTier = $('infra-tier').value;
  const infraPrice = getPrice(PRICING.infrastructure[infraTier]);

  let billedHosts;
  if (peakForgiven) {
    billedHosts = normal;
  } else {
    billedHosts = peak;
  }

  const normalBill = normal * infraPrice;
  const actualBill = billedHosts * infraPrice;
  const peakBill = peak * infraPrice;
  const hwmImpact = actualBill - normalBill;

  let html = '';
  html += `<div class="hwm-row"><span>Hours in month</span><span>${totalHours}</span></div>`;
  html += `<div class="hwm-row"><span>Top 1% forgiven</span><span>${top1pct} hours</span></div>`;
  html += `<div class="hwm-row"><span>Peak duration</span><span>${peakHours} hours</span></div>`;
  html += `<div class="hwm-row"><span>Peak forgiven?</span><span>${peakForgiven ? 'Yes' : 'No'}</span></div>`;
  html += `<div class="hwm-row"><span>Normal bill (${normal} hosts)</span><span>${fmt(normalBill)}/mo</span></div>`;
  html += `<div class="hwm-row"><span>Peak bill if charged (${peak} hosts)</span><span>${fmt(peakBill)}/mo</span></div>`;
  html += `<div class="hwm-row highlight"><span>Actual bill (${billedHosts} hosts)</span><span>${fmt(actualBill)}/mo</span></div>`;

  if (!peakForgiven) {
    html += `<div class="hwm-row highlight"><span>Cost of scaling event</span><span>+${fmt(hwmImpact)}/mo</span></div>`;
    html += `<div class="hwm-row savings-row"><span>Tip: Keep peak under ${top1pct}h to avoid</span><span></span></div>`;
  } else {
    html += `<div class="hwm-row savings-row"><span>Peak fully forgiven by 99th pctile billing</span><span></span></div>`;
  }

  $('hwmResults').innerHTML = html;
}

function updateUnitEconomics() {
  const revenue = val('monthly-revenue');
  const totalMonthly = window._currentMonthly || 0;

  if (revenue > 0 && totalMonthly > 0) {
    $('economicsResults').style.display = 'block';
    const pct = (totalMonthly / revenue * 100).toFixed(2);
    $('costPctRevenue').textContent = pct + '%';

    // Blended cost per host
    let totalHosts = 0;
    if (checked('infrastructure-enabled')) totalHosts += val('infra-hosts');
    if (totalHosts > 0) {
      $('costPerHost').textContent = fmtDec(totalMonthly / totalHosts);
    } else {
      $('costPerHost').textContent = 'N/A';
    }
  } else {
    $('economicsResults').style.display = 'none';
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  // Billing toggle
  $('billingToggle').addEventListener('click', function(e) {
    if (e.target.tagName === 'BUTTON') {
      billingType = e.target.dataset.type;
      this.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      calculate();
    }
  });

  // Presets
  $('presets').addEventListener('click', function(e) {
    if (e.target.tagName === 'BUTTON') {
      const preset = e.target.dataset.preset;
      if (preset === 'clear') {
        clearAll();
      } else if (PRESETS[preset]) {
        applyPreset(PRESETS[preset]);
      }
    }
  });

  // Discount slider
  $('discount').addEventListener('input', calculate);

  // Initial calculation
  calculate();
  updateHWM();
});

function applyPreset(preset) {
  for (const [id, value] of Object.entries(preset.values)) {
    const el = $(id);
    if (!el) continue;
    if (el.type === 'checkbox') {
      el.checked = value;
    } else {
      el.value = value;
    }
  }

  // Expand enabled sections, collapse disabled
  const products = ['infrastructure', 'apm', 'logs', 'containers', 'customMetrics', 'serverless', 'synthetics', 'rum', 'dbm', 'network', 'security'];
  products.forEach(p => {
    const body = $(p + '-body');
    const enabled = $(p + '-enabled');
    if (body && enabled) {
      if (enabled.checked) {
        body.classList.remove('collapsed');
      } else {
        body.classList.add('collapsed');
      }
    }
  });

  calculate();
}

function clearAll() {
  document.querySelectorAll('input[type="number"]').forEach(el => {
    if (el.id !== 'hwm-normal' && el.id !== 'hwm-peak' && el.id !== 'hwm-hours' && el.id !== 'monthly-revenue') {
      el.value = 0;
    }
  });
  document.querySelectorAll('input[type="checkbox"]').forEach(el => {
    if (el.id === 'infrastructure-enabled') {
      el.checked = true;
    } else {
      el.checked = false;
    }
  });

  // Collapse all except infrastructure
  const products = ['apm', 'logs', 'containers', 'customMetrics', 'serverless', 'synthetics', 'rum', 'dbm', 'network', 'security'];
  products.forEach(p => {
    const body = $(p + '-body');
    if (body) body.classList.add('collapsed');
  });
  $('infrastructure-body').classList.remove('collapsed');
  $('discount').value = 0;

  calculate();
}
