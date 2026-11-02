# Query healthcheck
curl http://localhost:8080/healthz
# Response: {"status":"healthy","uptime":42.5,"timestamp":1710000000000}

# Query OpenTelemetry metrics
curl http://localhost:8080/metrics