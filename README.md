# Datadog Pricing Calculator

Interactive calculator for estimating Datadog monitoring costs across all major product lines.

## Features

- Real-time cost estimation across 11 product categories
- Annual commitment vs on-demand price comparison
- Negotiated discount modeling (0-40%)
- Pre-built scenarios (Startup, Mid-Market, Enterprise)
- Container and custom metrics allotment tracking
- 12-month growth projection with adjustable growth rate
- High-water mark billing simulator
- Unit economics calculator (cost as % of revenue)

## Products Covered

Infrastructure Monitoring, APM, Log Management, Containers, Custom Metrics, Serverless, Synthetic Monitoring, Real User Monitoring (RUM), Database Monitoring, Network Monitoring, Cloud Security (CSM)

## Running Locally

```bash
go run main.go
```

Open http://localhost:8080

## Deploy to Cloud Run

1. Run the setup script to configure GCP:
   ```bash
   GCP_PROJECT_ID=your-project ./setup-gcp-deploy.sh
   ```

2. Add GitHub secrets:
   - `GCP_PROJECT_ID`
   - `GCP_REGION`
   - `GCP_SA_KEY`

3. Push to `main` to trigger deployment.

## Pricing Data

Based on publicly available Datadog list prices. Actual costs may vary based on negotiated contracts and volume discounts.
