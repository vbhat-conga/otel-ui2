# OpenTelemetry E-Commerce Demo

This is a React application with OpenTelemetry integration to demonstrate the usefulness of OpenTelemetry at the browser level for monitoring user interactions, API calls, and overall application performance.

## Features

- **Complete E-Commerce Workflow**: Browse products, view details, add to cart, and checkout
- **OpenTelemetry Integration**: Comprehensive tracing of UI interactions and API calls
- **Business Transaction Tracking**: Two main business transactions are tracked:
  1. Product Browsing & Cart Management
  2. Checkout Process
- **Tailwind CSS**: Modern, responsive UI with Tailwind CSS
- **TypeScript**: Full type safety across the application

## Architecture

The application is structured with the following components:

- **API Services**: Simulated e-commerce API calls wrapped with OpenTelemetry instrumentation
- **Business Transactions**: Each user flow is tracked as a business transaction
- **Component Rendering Metrics**: Each component tracks its render time
- **API Call Tracking**: All API calls are tracked with timing information

## Running the Application

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Open the application at [http://localhost:3000](http://localhost:3000)

## OpenTelemetry Collector Setup

To visualize the OpenTelemetry traces, you need to set up an OpenTelemetry Collector. 

### Option 1: Using Jaeger All-in-One

1. Run Jaeger via Docker:

```bash
docker run -d --name jaeger \
  -e COLLECTOR_ZIPKIN_HOST_PORT=:9411 \
  -p 5775:5775/udp \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  -p 5778:5778 \
  -p 16686:16686 \
  -p 14250:14250 \
  -p 14268:14268 \
  -p 14269:14269 \
  -p 9411:9411 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. Access the Jaeger UI at [http://localhost:16686](http://localhost:16686)

### Option 2: Using OpenTelemetry Collector with Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3'
services:
  # Jaeger
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686" # Jaeger UI
      - "14250:14250" # Model
      - "14268:14268" # Collector HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4318:4318" # OTLP HTTP Receiver
      - "8889:8889" # Prometheus exporter
    depends_on:
      - jaeger
```

Create `otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins:
            - http://localhost:3000
            - http://localhost:*
            - "*"

processors:
  batch:
    timeout: 1s

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true

  logging:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger, logging]
```

Then run:

```bash
docker-compose up -d
```

## Business Transactions

### 1. Product Browsing & Cart Management
This business transaction tracks:
- Product list loading time
- Product detail view time
- Add to cart actions
- Cart view and management

### 2. Checkout Process
This business transaction tracks:
- Form validation time
- Payment processing time
- Order confirmation

## OpenTelemetry Trace View

With OpenTelemetry, you can identify:
- Page load time
- Component rendering time
- API call durations
- UI interaction times
- Business transaction metrics

## Technologies Used

- React
- TypeScript
- OpenTelemetry
- Tailwind CSS
- Vite
- React Router

## Public APIs

This application uses the JSONPlaceholder API as a mock data source:
- https://jsonplaceholder.typicode.com