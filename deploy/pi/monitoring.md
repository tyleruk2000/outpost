# Outpost in Prometheus and Grafana

For a Pi that already runs Prometheus and Grafana (in Docker, beside Outpost, or on
another computer on the network).

## Turn it on

Add `--metrics` when you run the install script, or set it in `.env` and restart:

```bash
echo OUTPOST_METRICS=true >> .env
docker compose up -d
curl -s http://localhost:8080/metrics | head
```

`/metrics` answers only this computer and private networks (10/8, 172.16/12,
192.168/16, 100.64/10, 169.254/16, fc00::/7, fe80::/10 and loopback), which is where a
Prometheus container on the same Pi connects from. With it off, `/metrics` answers 404
and says how to turn it on.

## Scrape it

In `prometheus.yml`, with the Pi's address on your network (a Prometheus container
reaches Outpost there, through the port Outpost publishes):

```yaml
scrape_configs:
  - job_name: "outpost"
    scrape_interval: 60s
    static_configs:
      - targets: ["192.168.1.20:8080"]
```

Prometheus started with `--config.file` and no `--web.enable-lifecycle` reads the file
again only when restarted: `sudo docker restart prometheus`.

Each scrape is a request, and Outpost measures its event-loop delay while there are
requests, so with Prometheus scraping the delay is always measured. The timer behind it
fires fifty times a second; on a Pi that is otherwise idle, a scrape interval of a minute
is plenty.

## The dashboard

`grafana-outpost.json`, beside this file, is a dashboard of the figures below. Import it
(Dashboards → New → Import), or put it in a folder Grafana provisions dashboards from.
It asks for the Prometheus data source as a variable, so it needs no editing, and picks
the job from `outpost_info`.

## What is there

| Name | Kind | What |
| --- | --- | --- |
| `outpost_info{version}` | gauge | Always 1; the version as a label |
| `outpost_uptime_seconds` | gauge | Since the server started |
| `outpost_http_request_duration_seconds{method,route}` | histogram | Request times by route (the live-events stream is left out) |
| `outpost_event_loop_measuring` | gauge | 1 while the delay is measured |
| `outpost_event_loop_delay_max_seconds`, `_mean_seconds` | gauge | The worst and mean hold-up of the server's thread in the current minute |
| `outpost_jobs{state,queue}` | gauge | Jobs in the jobs table by state and queue |
| `outpost_download_bytes_per_second` | gauge | All transferring downloads together |
| `outpost_storage_location_up{location,name,kind}` | gauge | 1 connected, 0 not |
| `outpost_storage_location_free_bytes`, `_size_bytes` | gauge | As last checked |
| `outpost_database_bytes{file}` | gauge | `main` and `wal` |
| `outpost_backup_last_timestamp_seconds{kind}`, `outpost_backup_age_seconds{kind}` | gauge | `stored` (to a storage location) and `downloaded` (from Settings) |
| `outpost_process_memory_bytes`, `outpost_system_memory_available_bytes` | gauge | Memory |
| `outpost_temperature_celsius{sensor}` | gauge | Where the system gives it |

cAdvisor and the node exporter already give the container's and the Pi's own figures
(CPU, disk, network); these are the ones only Outpost knows.
