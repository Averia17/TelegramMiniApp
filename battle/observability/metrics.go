package observability

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type metricSeries struct {
	labels  map[string]string
	value   float64
	buckets []uint64
	sum     float64
	count   uint64
}

type metricFamily struct {
	name   string
	help   string
	kind   string
	bounds []float64
	series map[string]*metricSeries
}

type Registry struct {
	mu       sync.Mutex
	families map[string]*metricFamily
}

var Default = NewRegistry()

func NewRegistry() *Registry {
	return &Registry{families: make(map[string]*metricFamily)}
}

func (r *Registry) IncCounter(name, help string, labels map[string]string) {
	r.AddCounter(name, help, 1, labels)
}

func (r *Registry) AddCounter(name, help string, value float64, labels map[string]string) {
	if value == 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	family := r.ensureFamily(name, help, "counter", nil)
	if family == nil {
		return
	}
	series := r.ensureSeries(family, labels)
	series.value += value
}

func (r *Registry) SetGauge(name, help string, value float64, labels map[string]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	family := r.ensureFamily(name, help, "gauge", nil)
	if family == nil {
		return
	}
	series := r.ensureSeries(family, labels)
	series.value = value
}

func (r *Registry) AddGauge(name, help string, delta float64, labels map[string]string) {
	if delta == 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	family := r.ensureFamily(name, help, "gauge", nil)
	if family == nil {
		return
	}
	series := r.ensureSeries(family, labels)
	series.value += delta
}

func (r *Registry) ObserveHistogram(name, help string, value float64, bounds []float64, labels map[string]string) {
	if value < 0 {
		value = 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	family := r.ensureFamily(name, help, "histogram", bounds)
	if family == nil {
		return
	}
	series := r.ensureSeries(family, labels)
	for index, bound := range family.bounds {
		if value <= bound {
			series.buckets[index]++
		}
	}
	series.buckets[len(family.bounds)]++
	series.sum += value
	series.count++
}

func (r *Registry) ensureFamily(name, help, kind string, bounds []float64) *metricFamily {
	if name == "" || help == "" {
		return nil
	}
	if existing := r.families[name]; existing != nil {
		if existing.kind != kind {
			return nil
		}
		return existing
	}
	family := &metricFamily{
		name:   name,
		help:   help,
		kind:   kind,
		series: make(map[string]*metricSeries),
	}
	if kind == "histogram" {
		family.bounds = append([]float64(nil), bounds...)
		sort.Float64s(family.bounds)
	}
	r.families[name] = family
	return family
}

func (r *Registry) ensureSeries(family *metricFamily, labels map[string]string) *metricSeries {
	key := labelsKey(labels)
	if series := family.series[key]; series != nil {
		return series
	}
	series := &metricSeries{labels: cloneLabels(labels)}
	if family.kind == "histogram" {
		series.buckets = make([]uint64, len(family.bounds)+1)
	}
	family.series[key] = series
	return series
}

func cloneLabels(labels map[string]string) map[string]string {
	if len(labels) == 0 {
		return nil
	}
	copyOf := make(map[string]string, len(labels))
	for key, value := range labels {
		copyOf[key] = value
	}
	return copyOf
}

func labelsKey(labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var builder strings.Builder
	for _, key := range keys {
		builder.WriteString(key)
		builder.WriteByte('=')
		builder.WriteString(labels[key])
		builder.WriteByte('\x00')
	}
	return builder.String()
}

func formatLabels(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf(`%s="%s"`, key, escapeLabel(labels[key])))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func escapeLabel(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return strings.ReplaceAll(value, "\n", `\n`)
}

func formatValue(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func (r *Registry) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	r.mu.Lock()
	defer r.mu.Unlock()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	names := make([]string, 0, len(r.families))
	for name := range r.families {
		names = append(names, name)
	}
	sort.Strings(names)
	var output strings.Builder
	for _, name := range names {
		family := r.families[name]
		output.WriteString("# HELP ")
		output.WriteString(family.name)
		output.WriteByte(' ')
		output.WriteString(family.help)
		output.WriteByte('\n')
		output.WriteString("# TYPE ")
		output.WriteString(family.name)
		output.WriteByte(' ')
		output.WriteString(family.kind)
		output.WriteByte('\n')
		seriesKeys := make([]string, 0, len(family.series))
		for key := range family.series {
			seriesKeys = append(seriesKeys, key)
		}
		sort.Strings(seriesKeys)
		for _, key := range seriesKeys {
			series := family.series[key]
			switch family.kind {
			case "histogram":
				for index, count := range series.buckets {
					labels := cloneLabels(series.labels)
					if labels == nil {
						labels = make(map[string]string, 1)
					}
					if index == len(family.bounds) {
						labels["le"] = "+Inf"
					} else {
						labels["le"] = formatValue(family.bounds[index])
					}
					output.WriteString(family.name)
					output.WriteString("_bucket")
					output.WriteString(formatLabels(labels))
					output.WriteByte(' ')
					output.WriteString(strconv.FormatUint(count, 10))
					output.WriteByte('\n')
				}
				output.WriteString(family.name)
				output.WriteString("_sum")
				output.WriteString(formatLabels(series.labels))
				output.WriteByte(' ')
				output.WriteString(formatValue(series.sum))
				output.WriteByte('\n')
				output.WriteString(family.name)
				output.WriteString("_count")
				output.WriteString(formatLabels(series.labels))
				output.WriteByte(' ')
				output.WriteString(strconv.FormatUint(series.count, 10))
				output.WriteByte('\n')
			default:
				output.WriteString(family.name)
				output.WriteString(formatLabels(series.labels))
				output.WriteByte(' ')
				output.WriteString(formatValue(series.value))
				output.WriteByte('\n')
			}
		}
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(output.String()))
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("underlying response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func (w *statusWriter) Flush() {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func HTTPMiddleware(registry *Registry, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		writer := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(writer, r)
		status := writer.status
		if status == 0 {
			status = http.StatusOK
		}
		labels := map[string]string{
			"method": r.Method,
			"route":  routeName(r.URL.Path),
			"status": strconv.Itoa(status),
		}
		registry.IncCounter("battle_http_requests_total", "Total HTTP requests handled by the battle service", labels)
		registry.ObserveHistogram("battle_http_request_duration_seconds", "HTTP request duration in seconds", time.Since(started).Seconds(), []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5}, labels)
	})
}

func routeName(path string) string {
	switch path {
	case "/health":
		return "health"
	case "/heroes":
		return "heroes"
	case "/ws":
		return "websocket"
	case "/metrics":
		return "metrics"
	default:
		return "other"
	}
}

type BattleTickSample struct {
	Gap, Update, Snapshot, Queue time.Duration
	Updates, Bytes, Dropped      int
	Slow                         bool
}

var battleDurationBuckets = []float64{.001, .0025, .005, .01, .0167, .025, .05, .1}

func RecordBattleTick(registry *Registry, sample BattleTickSample) {
	registry.IncCounter("battle_ticks_total", "Authoritative battle simulation ticks", nil)
	registry.AddCounter("battle_state_updates_total", "State snapshots prepared for clients", float64(sample.Updates), nil)
	registry.AddCounter("battle_state_bytes_total", "Serialized state snapshot bytes queued for clients", float64(sample.Bytes), nil)
	registry.AddCounter("battle_state_queue_drops_total", "State snapshots replaced before delivery because the latest-only queue was full", float64(sample.Dropped), nil)
	if sample.Slow {
		registry.IncCounter("battle_slow_ticks_total", "Battle ticks exceeding the operational time budget", nil)
	}
	registry.ObserveHistogram("battle_tick_gap_seconds", "Time between authoritative battle ticks", sample.Gap.Seconds(), battleDurationBuckets, nil)
	registry.ObserveHistogram("battle_state_update_seconds", "Authoritative game update duration", sample.Update.Seconds(), battleDurationBuckets, nil)
	registry.ObserveHistogram("battle_snapshot_prepare_seconds", "State snapshot preparation duration", sample.Snapshot.Seconds(), battleDurationBuckets, nil)
	registry.ObserveHistogram("battle_state_queue_seconds", "State snapshot queue duration", sample.Queue.Seconds(), battleDurationBuckets, nil)
}
