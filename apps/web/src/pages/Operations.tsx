import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Mail, MapPin, Phone, Sparkles, Trash2, Clock, Tag, ExternalLink, CheckCircle2, AlertCircle, Info, Search, RefreshCw, Eye, Shield, Wifi, BarChart2, Layers, FileText, Server, Database, Cloud, HardDrive, Cpu, MemoryStick, Network, Terminal, Activity, Zap, Settings, Code, Key, Lock, Unlock, Bell, BellOff } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { ProgressIndicator, ProgressStep } from '../components/ui/ProgressIndicator';
import { cn } from '../lib/utils';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';
import api from '../services/api';

const AI_HEALTH_STEPS: ProgressStep[] = [
  { label: 'Checking provider configs', duration: 500 },
  { label: 'Probing Mercury 3', duration: 3000 },
  { label: 'Probing NVIDIA Nemotron', duration: 3000 },
  { label: 'Validating model availability', duration: 2000 },
  { label: 'Verifying structured output', duration: 2000 },
  { label: 'Updating health cache', duration: 500 },
];

export default function Operations() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'ai' | 'scraper' | 'system' | 'logs'>('ai');
  const [aiHealth, setAiHealth] = useState<any>(null);
  const [scraperHealth, setScraperHealth] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [isChecking, setIsChecking] = useState(false);

  usePageMetadata({
    title: 'Webloom | Operations',
    description: 'System health, AI provider monitoring, and operational controls.',
    noindex: true,
  });

  const checkAiHealth = useMutation({
    mutationFn: async () => {
      const response = await api.get('/health/ai?force=1');
      return response.data;
    },
    onSuccess: (data) => {
      setAiHealth(data);
    },
  });

  const checkScraperHealth = useMutation({
    mutationFn: async () => {
      const response = await api.get('/health/scraper');
      return response.data;
    },
    onSuccess: (data) => {
      setScraperHealth(data);
    },
  });

  const checkSystemHealth = useMutation({
    mutationFn: async () => {
      const response = await api.get('/health');
      return response.data;
    },
    onSuccess: (data) => {
      setSystemHealth(data);
    },
  });

  const runFullCheck = async () => {
    setIsChecking(true);
    try {
      await Promise.all([
        checkAiHealth.mutateAsync(),
        checkScraperHealth.mutateAsync(),
        checkSystemHealth.mutateAsync(),
      ]);
      addLog('info', 'Full health check completed');
    } catch (error) {
      addLog('error', `Health check failed: ${error}`);
    } finally {
      setIsChecking(false);
    }
  };

  const addLog = (level: string, message: string) => {
    setLogs(prev => [
      { timestamp: new Date().toISOString(), level, message },
      ...prev.slice(0, 99)
    ]);
  };

  // Initial health checks
  useEffect(() => {
    runFullCheck();
    const interval = setInterval(() => {
      checkAiHealth.mutate();
      checkScraperHealth.mutate();
      checkSystemHealth.mutate();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Mock system health data
  const systemMetrics = {
    cpu: Math.floor(Math.random() * 30) + 10,
    memory: Math.floor(Math.random() * 40) + 30,
    disk: Math.floor(Math.random() * 20) + 10,
    network: Math.floor(Math.random() * 5) + 1,
    uptime: '2d 14h 32m',
    nodeVersion: 'v20.12.0',
    platform: 'linux',
  };

  const aiProviders = aiHealth?.providers || {};
  const aiChain = aiHealth?.chain || ['mercury', 'nvidia'];
  const aiStatus = aiHealth?.status || 'unknown';

  const scraperStatus = scraperHealth?.status || 'unknown';
  const scraperQueue = scraperHealth?.queue || { depth: 0, activeJobs: 0 };

  const renderAiProviderCard = (name: string) => {
    const provider = aiProviders[name];
    if (!provider) return null;
    const isPrimary = aiChain[0] === name;
    const status = provider.usable === true ? 'verified' : provider.configured ? 'warning' : 'new';
    const label = name === 'mercury' ? 'Mercury 3' : name === 'nvidia' ? 'NVIDIA Nemotron 3 Ultra' : name;

    return (
      <div className={cls('wl-card', 'p-5', 'transition-all', frac('hover:border-primary', '30'))}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', 
              name === 'mercury' ? cls(frac('bg-primary', '12'), 'text-primary') : cls(frac('bg-ai', '12'), 'text-ai'))}>
              {name === 'mercury' ? 'M3' : 'N3'}
            </div>
            <div>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{provider.model}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {isPrimary && <Chip variant="primary" size="sm">PRIMARY</Chip>}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="wl-eyebrow">Latency (p50)</p>
            <p className="font-display text-lg font-bold tabular-nums text-foreground">{provider.latencyP50Ms ?? '—'}ms</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="wl-eyebrow">Success rate</p>
            <p className="font-display text-lg font-bold tabular-nums text-foreground">
              {provider.failureRate != null ? `${((1 - provider.failureRate) * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="wl-eyebrow">Circuit</p>
            <p className="font-display text-lg font-bold tabular-nums text-foreground">
              {provider.circuitState ?? 'CLOSED'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="wl-eyebrow">Operations</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              System health & <span className="text-gradient-brand">operational controls</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Monitor AI provider health, scraper worker status, system resources, and operational events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default" size="lg" onClick={runFullCheck} disabled={isChecking} leadingIcon={isChecking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}>
              {isChecking ? 'Checking…' : 'Run Full Health Check'}
            </Button>
            <Button variant="secondary" size="lg" leadingIcon={<Terminal className="h-4 w-4" />}>
              View Logs
            </Button>
          </div>
        </div>

        <div className={cls('relative mt-8 flex flex-wrap gap-2 border-t pt-5', frac('border-border', '70'))}>
          {[
            { key: 'ai', label: 'AI Providers', icon: Sparkles },
            { key: 'scraper', label: 'Scraper Worker', icon: Search },
            { key: 'system', label: 'System Resources', icon: Server },
            { key: 'logs', label: 'Event Log', icon: Terminal },
          ].map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key as typeof activeSection)}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200', 
                activeSection === section.key 
                  ? 'bg-gradient-to-r from-primary to-ai text-white shadow-glow-blue' 
                  : cls(frac('hover:bg-secondary', '70')))}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
          ))}
        </div>
      </header>

      {activeSection === 'ai' && (
        <div className="space-y-6">
          {/* Chain Overview */}
          <div className={cls('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac('to-ai', '5'))}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', frac('bg-ai', '12'), 'text-ai')}>
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="wl-eyebrow">Provider chain</p>
                  <p className="font-medium text-foreground">{aiChain.join(' → ') || 'mercury → nvidia'}</p>
                </div>
              </div>
              <StatusBadge status={aiStatus === 'healthy' ? 'verified' : aiStatus === 'degraded' ? 'warning' : 'danger'} />
            </div>

            {/* Provider Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {['mercury', 'nvidia'].map((name) => renderAiProviderCard(name))}
            </div>

            {/* Circuit Breaker Status */}
            <div className={cls('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac('to-ai', '5'))}>
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-ai" />
                Circuit breaker status
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {['mercury', 'nvidia'].map((name) => {
                  const provider = aiProviders[name];
                  if (!provider) return null;
                  return (
                    <div key={name} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-foreground">{name === 'mercury' ? 'Mercury 3' : 'NVIDIA Nemotron'}</span>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]', 
                          provider.circuitState === 'OPEN' ? cls(frac('bg-danger', '10'), 'text-danger') :
                          provider.circuitState === 'HALF_OPEN' ? cls(frac('bg-warning', '10'), 'text-warning-foreground') :
                          cls(frac('bg-verified', '10'), 'text-verified'))}>
                          {provider.circuitState ?? 'CLOSED'}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Failures: {provider.failureCount ?? 0}</div>
                        <div>Successes: {provider.successCount ?? 0}</div>
                        <div>Last failure: {provider.lastFailure ? new Date(provider.lastFailure).toLocaleString() : 'None'}</div>
                        <div>Next attempt: {provider.nextAttempt ? new Date(provider.nextAttempt).toLocaleString() : 'N/A'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Provider Capabilities */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-ai" />
                Capability matrix
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left p-3 font-medium">Capability</th>
                      <th className="text-center p-3 font-medium">Mercury 3</th>
                      <th className="text-center p-3 font-medium">NVIDIA Nemotron</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { key: 'business_extraction', label: 'Business extraction', mercury: true, nvidia: true },
                      { key: 'business_research', label: 'Business research', mercury: true, nvidia: true },
                      { key: 'entity_resolution', label: 'Entity resolution', mercury: true, nvidia: true },
                      { key: 'review_analysis', label: 'Review analysis', mercury: true, nvidia: true },
                      { key: 'sentiment_classification', label: 'Sentiment classification', mercury: true, nvidia: true },
                      { key: 'competitor_analysis', label: 'Competitor analysis', mercury: true, nvidia: true },
                      { key: 'trend_classification', label: 'Trend classification', mercury: true, nvidia: true },
                      { key: 'report_generation', label: 'Report generation', mercury: true, nvidia: true },
                      { key: 'structured_output', label: 'Structured output', mercury: true, nvidia: false },
                    ].map((row) => (
                      <tr key={row.key} className={cls(frac('hover:bg-secondary', '50'))}>
                        <td className="p-3 font-medium text-foreground">{row.label}</td>
                        <td className="text-center p-3">
                          {row.mercury ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="text-center p-3">
                          {row.nvidia ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'scraper' && (
        <div className="space-y-6">
          {/* Worker Status */}
          <div className={cls('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac('to-ai', '5'))}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', frac('bg-ai', '12'), 'text-ai')}>
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <p className="wl-eyebrow">Google Maps scraper worker</p>
                  <p className="font-medium text-foreground">Dockerized extraction service</p>
                </div>
              </div>
              <StatusBadge status={scraperStatus === 'healthy' ? 'verified' : scraperStatus === 'degraded' ? 'warning' : 'danger'} />
            </div>

            <div className="grid gap-4 sm:grid-cols-4 mt-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="wl-eyebrow">Health</p>
                <p className="font-display text-2xl font-bold tabular-nums text-foreground">{scraperStatus === 'healthy' ? 'Healthy' : scraperStatus}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="wl-eyebrow">Queue depth</p>
                <p className="font-display text-2xl font-bold tabular-nums text-foreground">{scraperQueue?.depth ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="wl-eyebrow">Active jobs</p>
                <p className="font-display text-2xl font-bold tabular-nums text-foreground">{scraperQueue?.activeJobs ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="wl-eyebrow">Version</p>
                <p className="font-display text-2xl font-bold tabular-nums text-foreground">{scraperHealth?.version ?? '1.0.0'}</p>
              </div>
            </div>

            {/* Scraper Configuration */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-ai" />
                Configuration
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Base URL</p>
                  <p className="font-mono text-sm text-foreground">http://localhost:8080</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Timeout</p>
                  <p className="font-mono text-sm text-foreground">180s</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Concurrency</p>
                  <p className="font-mono text-sm text-foreground">2</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Max results</p>
                  <p className="font-mono text-sm text-foreground">100</p>
                </div>
              </div>
            </div>

            {/* Scraper Job Management */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Search className="h-5 w-5 text-ai" />
                Job management
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className={cls('flex h-8 w-8 items-center justify-center rounded-lg', frac('bg-ai', '12'), 'text-ai')}>
                      <Search className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Submit extraction job</p>
                      <p className="text-sm text-muted-foreground">POST /api/v1/jobs</p>
                    </div>
                  </div>
                  <Button variant="secondary" leadingIcon={<Plus className="h-4 w-4" />}>
                    Open Business Intelligence
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className={cls('flex h-8 w-8 items-center justify-center rounded-lg', frac('bg-primary', '12'), 'text-primary')}>
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">View job queue</p>
                      <p className="text-sm text-muted-foreground">GET /api/v1/jobs</p>
                    </div>
                  </div>
                  <Button variant="secondary" leadingIcon={<Activity className="h-4 w-4" />}>
                    Open Job Queue
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className={cls('flex h-8 w-8 items-center justify-center rounded-lg', frac('bg-verified', '12'), 'text-verified')}>
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Worker health check</p>
                      <p className="text-sm text-muted-foreground">GET /api/v1/health</p>
                    </div>
                  </div>
                  <Button variant="secondary" leadingIcon={<CheckCircle2 className="h-4 w-4" />}>
                    Run Health Check
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'system' && (
        <div className="space-y-6">
          {/* System Overview */}
          <div className={cls('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac('to-primary', '5'))}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', frac('bg-primary', '12'), 'text-primary')}>
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <p className="wl-eyebrow">System resources</p>
                  <p className="font-medium text-foreground">Runtime metrics</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cls('inline-flex items-center gap-1 rounded-full', frac('bg-verified', '10'), 'px-2', 'py-0.5', 'text-[10px]', 'font-semibold', 'uppercase', 'tracking-[0.1em]', 'text-verified')}>
                  <span className="h-1.5 w-1.5 rounded-full bg-verified" />
                  Healthy
                </span>
                <span className="text-sm text-muted-foreground">Uptime: {systemMetrics.uptime}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
              <div className={cls('rounded-xl border border-border bg-gradient-to-br from-secondary via-card p-5', frac('to-primary', '5'))}>
                <div className="flex items-center gap-3">
                  <div className={cls('flex h-12 w-12 items-center justify-center rounded-xl', frac('bg-primary', '12'), 'text-primary')}>
                    <Cpu className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="wl-eyebrow">CPU Usage</p>
                    <p className="font-display text-3xl font-bold tabular-nums text-foreground">{systemMetrics.cpu}%</p>
                  </div>
                </div>
              </div>
              <div className={cls('rounded-xl border border-border bg-gradient-to-br from-secondary via-card p-5', frac('to-verified', '5'))}>
                <div className="flex items-center gap-3">
                  <div className={cls('flex h-12 w-12 items-center justify-center rounded-xl', frac('bg-verified', '12'), 'text-verified')}>
                    <MemoryStick className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="wl-eyebrow">Memory Usage</p>
                    <p className="font-display text-3xl font-bold tabular-nums text-verified">{systemMetrics.memory}%</p>
                  </div>
                </div>
              </div>
              <div className={cls('rounded-xl border border-border bg-gradient-to-br from-secondary via-card p-5', frac('to-ai', '5'))}>
                <div className="flex items-center gap-3">
                  <div className={cls('flex h-12 w-12 items-center justify-center rounded-xl', frac('bg-ai', '12'), 'text-ai')}>
                    <HardDrive className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="wl-eyebrow">Disk Usage</p>
                    <p className="font-display text-3xl font-bold tabular-nums text-ai">{systemMetrics.disk}%</p>
                  </div>
                </div>
              </div>
              <div className={cls('rounded-xl border border-border bg-gradient-to-br from-secondary via-card p-5', frac('to-opportunity', '5'))}>
                <div className="flex items-center gap-3">
                  <div className={cls('flex h-12 w-12 items-center justify-center rounded-xl', frac('bg-opportunity', '12'), 'text-opportunity')}>
                    <Network className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="wl-eyebrow">Network I/O</p>
                    <p className="font-display text-3xl font-bold tabular-nums text-opportunity">{systemMetrics.network} MB/s</p>
                  </div>
                </div>
              </div>
            </div>

            {/* System Info */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                System information
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Node.js</p>
                  <p className="font-mono text-foreground">{systemMetrics.nodeVersion}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Platform</p>
                  <p className="font-mono text-foreground">{systemMetrics.platform}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Uptime</p>
                  <p className="font-mono text-foreground">{systemMetrics.uptime}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">PID</p>
                  <p className="font-mono text-foreground">{process.pid}</p>
                </div>
              </div>
            </div>

            {/* Database Status */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Database status
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Status</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-verified">Connected</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Type</p>
                  <p className="font-mono text-foreground">SQLite</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Path</p>
                  <p className="font-mono text-sm text-foreground">./webloom.db</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Pool</p>
                  <p className="font-mono text-foreground">1 connection</p>
                </div>
              </div>
            </div>

            {/* Redis Status */}
            <div className="wl-card p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                Redis cache
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Status</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-warning-foreground">Not configured</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Mode</p>
                  <p className="font-mono text-foreground">In-memory fallback</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">TTL</p>
                  <p className="font-mono text-foreground">7 days</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="wl-eyebrow">Max keys</p>
                  <p className="font-mono text-foreground">1000</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'logs' && (
        <div className="space-y-6">
          {/* Log Controls */}
          <div className="wl-card p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cls('flex h-10 w-10 items-center justify-center rounded-xl', frac('bg-primary', '12'), 'text-primary')}>
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <p className="wl-eyebrow">Event log</p>
                <p className="font-semibold text-foreground">Operational events & errors</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-verified" />
                {logs.length} events
              </div>
              <select className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground" defaultValue="all">
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <Button variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" />}>
                Refresh
              </Button>
              <Button variant="destructive" leadingIcon={<Trash2 className="h-4 w-4" />}>
                Clear
              </Button>
            </div>
          </div>

          {/* Log Entries */}
          <div className="wl-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground border-b border-border text-left text-sm">
                    <th className="p-3 font-medium w-40">Timestamp</th>
                    <th className="p-3 font-medium w-24">Level</th>
                    <th className="p-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        No events recorded yet. Run a health check to generate events.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, index) => (
                      <tr key={index} className={cls(frac('hover:bg-secondary', '50'))}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <Chip 
                            variant={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default'} 
                            size="sm"
                          >
                            {log.level.toUpperCase()}
                          </Chip>
                        </td>
                        <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Operations;